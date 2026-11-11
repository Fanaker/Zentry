import {validateMovement} from "@/lib/transactionRules";
import { limaDate } from "@/lib/dates";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useCategories, usePeople, type Transaction } from "@/hooks/useFinanceData";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  destination_amount: z.coerce.number().optional(),
  destination_currency: z.enum(["PEN","USD"]).optional(),
  tx_date: z.string().min(1, "Fecha requerida"),
  tx_type: z.enum(["expense", "income", "transfer"]),
  payment_account_id: z.string().optional(),
  origin_account_id: z.string().optional(),
  destination_account_id: z.string().optional(),
  category_id: z.string().optional(),
  person_id: z.string().optional(),
  description: z.string().max(500).optional(),
  amount_pen: z.coerce.number().min(0).default(0),
  amount_usd: z.coerce.number().min(0).default(0),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
});
type FormVals = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: Transaction | null;
  /** Prefill values for a NEW movement (used when duplicating). */
  prefill?: Transaction | null;
}

const NONE = "__none__";
type SavedForm = { values: z.input<typeof schema>; person: string; eventId: string };
type MovementTemplate = { name: string; values: z.input<typeof schema> };

function readLocal<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

export default function TransactionFormDialog({ open, onClose, initial, prefill }: Props) {
  const qc = useQueryClient();
  const eventId=useRef<string>(crypto.randomUUID());
  const { user } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const [submitting, setSubmitting] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [templates, setTemplates] = useState<MovementTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const formKey = `zentry.form.${user?.id ?? ""}`;
  const isNew = !initial && !prefill;

  const buildValuesFrom = (t: Transaction): FormVals => ({
    destination_amount:t.destination_amount??undefined,
    destination_currency:t.destination_currency??undefined,
    tx_date: t.tx_date,
    tx_type: t.tx_type,
    payment_account_id: t.payment_account_id ?? undefined,
    origin_account_id: t.origin_account_id ?? undefined,
    destination_account_id: t.destination_account_id ?? undefined,
    category_id: t.category_id ?? undefined,
    person_id: t.person_id ?? undefined,
    description: t.description ?? "",
    amount_pen: Number(t.amount_usd) > 0 && Number(t.amount_pen) === 0
      ? Number(t.amount_usd)
      : Number(t.amount_pen),
    amount_usd: 0,
    currency: Number(t.amount_usd) > 0 && Number(t.amount_pen) === 0 ? "USD" : t.currency,
  });

  const emptyValues: FormVals = {
    tx_date: limaDate(),
    tx_type: "expense",
    amount_pen: 0,
    amount_usd: 0,
    currency: "PEN",
  };

  const form = useForm<z.input<typeof schema>, unknown, FormVals>({
    resolver: zodResolver(schema),
    defaultValues: initial ? buildValuesFrom(initial) : prefill ? buildValuesFrom(prefill) : emptyValues,
  });

  // Re-sync the form whenever the dialog opens with a new record (edit/duplicate/new)
  useEffect(() => {
    if (!open) return;
    const draft = isNew ? readLocal<SavedForm | null>(formKey + ".draft", null) : null;
    form.reset(initial ? buildValuesFrom(initial) : prefill ? buildValuesFrom(prefill) : draft?.values ?? emptyValues);
    eventId.current = draft?.eventId ?? crypto.randomUUID();
    setNewPerson(draft?.person ?? "");
    setRecents(readLocal(formKey + ".recents", []));
    setTemplates(readLocal(formKey + ".templates", []));
    setTemplateName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, prefill?.id, formKey]);

  const txType = form.watch("tx_type");
  const currency = form.watch("currency");
  const selectedCategoryId = form.watch("category_id");
  const filteredCats = categories.filter((c) => c.tx_type === txType && (c.is_active || c.id === selectedCategoryId));

  // Account filters:
  // - Always exclude anuladas (is_active = false)
  // - For Ingreso/Gasto: only "dinero real" accounts AND currency must match
  // - For TI (transfer): all active accounts (incluye no reales y cualquier moneda)
  const activeAccounts = accounts.filter((a) => a.is_active);
  const recentRank = (id: string) => recents.includes(id) ? recents.indexOf(id) : recents.length;
  const paymentAccounts = activeAccounts.filter(
    (a) => a.counts_as_real_money && a.currency === currency,
  ).sort((a, b) => recentRank(a.id) - recentRank(b.id));

  function closeForm() {
    if (submitting) return;
    if (isNew) {
      const values = form.getValues();
      localStorage.setItem(formKey + ".draft", JSON.stringify({ values, person: newPerson, eventId: eventId.current }));
    }
    onClose();
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const next = [...templates.filter(template => template.name !== name), { name, values: form.getValues() }];
    localStorage.setItem(formKey + ".templates", JSON.stringify(next));
    setTemplates(next);
    setTemplateName("");
  }
  const transferAccounts = activeAccounts;

  const ensurePerson = async (): Promise<string | null> => {
    const sel = form.getValues("person_id");
    if (sel && sel !== NONE) return sel;
    if (!newPerson.trim()) return null;
    const { data, error } = await supabase
      .from("people")
      .insert({ name: newPerson.trim() })
      .select("id")
      .single();
    if (error) {
      const { data: existing } = await supabase
        .from("people").select("id").eq("name", newPerson.trim()).maybeSingle();
      if(!existing) throw error;
      return existing.id;
    }
    return data?.id ?? null;
  };

  const onSubmit = async (vals: FormVals) => {
    setSubmitting(true);
    try {
      const personId = await ensurePerson();
      const cleanId = (v: string | undefined) => (v && v !== NONE ? v : null);

      // Single amount input: route to the right currency column
      const amount = Number(vals.amount_pen) || 0; // we store the typed amount in amount_pen
      const amountPEN = vals.currency === "PEN" ? amount : 0;
      const amountUSD = vals.currency === "USD" ? amount : 0;

      const payload: any = {
        destination_amount: vals.tx_type === "transfer" ? vals.destination_amount ?? null : null,
        destination_currency: vals.tx_type === "transfer" ? vals.destination_currency ?? null : null,
        tx_date: vals.tx_date,
        tx_type: vals.tx_type,
        description: vals.description?.trim() || null,
        amount_pen: amountPEN,
        amount_usd: amountUSD,
        currency: vals.currency,
        category_id: cleanId(vals.category_id),
        person_id: personId,
        payment_account_id: vals.tx_type === "transfer" ? null : cleanId(vals.payment_account_id),
        origin_account_id: vals.tx_type === "transfer" ? cleanId(vals.origin_account_id) : null,
        destination_account_id: vals.tx_type === "transfer" ? cleanId(vals.destination_account_id) : null,
      };

      const origin=accounts.find(a=>a.id===payload.origin_account_id), destination=accounts.find(a=>a.id===payload.destination_account_id);
      if(vals.tx_type!=="transfer" || origin?.currency===destination?.currency){payload.destination_amount=null;payload.destination_currency=null;}
      const issues=validateMovement(payload,accounts,categories);
      if(issues.length)throw new Error(issues.join(" · "));
      if (initial) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Movimiento actualizado");
      } else {
        const { error } = await supabase
          .from("transactions")
          .insert({ ...payload, client_event_id:eventId.current, created_by: user?.id });
        if (error) throw error;
        toast.success("Movimiento registrado");
      }
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["people"] });
      if (isNew) localStorage.removeItem(formKey + ".draft");
      if (payload.payment_account_id) {
        const recent = [payload.payment_account_id, ...recents.filter(id => id !== payload.payment_account_id)];
        localStorage.setItem(formKey + ".recents", JSON.stringify(recent));
      }
      onClose();
      form.reset();
      setNewPerson("");
    } catch (err: any) {
      toast.error(err.message ?? "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeForm()}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-[46rem] max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle>
          <DialogDescription>Completa los datos del movimiento.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {isNew && <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-sm font-medium">Plantillas de movimientos</summary>
            <div className="mt-2 flex flex-col gap-2">
              {templates.map(template => <div className="flex justify-between gap-1" key={template.name}>
                <Button type="button" variant="outline" className="min-w-0" onClick={() => {
                  form.reset({ ...template.values, tx_date: limaDate() });
                  eventId.current = crypto.randomUUID();
                  setNewPerson("");
                }}>{template.name}</Button>
                <Button type="button" variant="ghost" onClick={() => {
                  const next = templates.filter(item => item.name !== template.name);
                  localStorage.setItem(formKey + ".templates", JSON.stringify(next));
                  setTemplates(next);
                }}>Quitar</Button>
              </div>)}
              <Input aria-label="Nombre de la plantilla" value={templateName} maxLength={48} onChange={event => setTemplateName(event.target.value)} placeholder="Nombre de la plantilla" />
              <Button type="button" variant="outline" disabled={!templateName.trim()} onClick={saveTemplate}>Guardar formulario como plantilla</Button>
            </div>
          </details>}
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="movement-amount">Monto ({currency === "USD" ? "Dólares" : "Soles"})</Label>
              <Input
                id="movement-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                {...form.register("amount_pen")}
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select value={form.watch("currency")} onValueChange={(v) => form.setValue("currency", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PEN">S/ PEN</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="movement-date">Fecha</Label>
              <Input id="movement-date" type="date" {...form.register("tx_date")} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.watch("tx_type")} onValueChange={(v) => form.setValue("tx_type", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="income">Ingreso</SelectItem>
                  <SelectItem value="transfer">TI (Transferencia interna)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {txType === "transfer" && <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:gap-4"><label className="text-sm">Importe recibido si cambia moneda<Input type="number" inputMode="decimal" min="0.01" step="0.01" {...form.register("destination_amount")}/></label><label className="text-sm">Moneda recibida<Select value={form.watch("destination_currency") ?? "PEN"} onValueChange={v=>form.setValue("destination_currency",v as "PEN"|"USD")}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PEN">PEN</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></label></div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {txType !== "transfer" ? (
            <div>
              <Label>Medio de pago</Label>
              <Select
                value={form.watch("payment_account_id") ?? NONE}
                onValueChange={(v) => form.setValue("payment_account_id", v)}
              >
                <SelectTrigger><SelectValue placeholder="Selecciona cuenta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {paymentAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:col-span-2 sm:gap-4">
              <div>
                <Label>Origen</Label>
                <Select
                  value={form.watch("origin_account_id") ?? NONE}
                  onValueChange={(v) => form.setValue("origin_account_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Origen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {transferAccounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destino</Label>
                <Select
                  value={form.watch("destination_account_id") ?? NONE}
                  onValueChange={(v) => form.setValue("destination_account_id", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Destino" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {transferAccounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className={txType === "transfer" ? "sm:col-span-2" : ""}>
            <Label>Categoría</Label>
            <Select
              value={form.watch("category_id") ?? NONE}
              onValueChange={(v) => form.setValue("category_id", v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {filteredCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          </div>

          <div>
            <Label>Referente a (opcional)</Label>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
              <Select
                value={form.watch("person_id") ?? NONE}
                onValueChange={(v) => { form.setValue("person_id", v); setNewPerson(""); }}
              >
                <SelectTrigger><SelectValue placeholder="ND / Persona existente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ND (yo mismo)</SelectItem>
                  {people.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <Input
                placeholder="O nueva persona…"
                value={newPerson}
                onChange={(e) => { setNewPerson(e.target.value); form.setValue("person_id", NONE); }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="movement-description">Descripción</Label>
            <Textarea id="movement-description" rows={3} maxLength={500} {...form.register("description")} />
          </div>

          <DialogFooter className="grid grid-cols-1 gap-2 border-t border-border pt-4 sm:flex sm:flex-row sm:flex-wrap sm:justify-end sm:space-x-0">
            {isNew && <Button type="button" variant="ghost" disabled={submitting} onClick={() => {
              localStorage.removeItem(formKey + ".draft");
              onClose();
            }}>Descartar</Button>}
            <Button type="button" variant="ghost" disabled={submitting} onClick={closeForm}>{isNew ? "Cerrar y guardar borrador" : "Cancelar"}</Button>
            <Button type="submit" className="min-w-32" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initial ? "Guardar cambios" : "Registrar movimiento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
