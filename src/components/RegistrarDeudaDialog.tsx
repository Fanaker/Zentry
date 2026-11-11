import { limaDate } from "@/lib/dates";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FilePlus2, Loader2 } from "lucide-react";
import type { Person } from "@/hooks/useFinanceData";

export const LOAN_CATEGORY_NAME = "Préstamos / Deudas";
const NEW = "__new__";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
  defaultPersonId?: string;
  loanCatId?: string;
};

export const RegistrarDeudaDialog = ({ open, onOpenChange, people, defaultPersonId, loanCatId }: Props) => {
  const qc = useQueryClient();
  const [personId, setPersonId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(limaDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPersonId(defaultPersonId ?? (people.length ? "" : NEW));
      setNewName("");
      setAmount("");
      setDate(limaDate());
      setNote("");
    }
  }, [open, defaultPersonId, people.length]);

  const handleSave = async () => {
    const value = Number(amount);
    if (!personId) return toast.error("Selecciona una persona");
    if (personId === NEW && !newName.trim()) return toast.error("Ingresa el nombre de la persona");
    if (!value || value <= 0) return toast.error("Ingresa un monto válido");
    setBusy(true);
    try {
      let pid = personId;
      if (pid === NEW) {
        const { data, error } = await supabase.from("people").insert({ name: newName.trim() }).select("id").single();
        if (error) throw error;
        pid = data.id;
      }
      let catId = loanCatId;
      if (!catId) {
        const { data, error } = await supabase
          .from("categories").insert({ name: LOAN_CATEGORY_NAME, tx_type: "expense" }).select("id").single();
        if (error) throw error;
        catId = data.id;
      }
      const { error } = await supabase.from("transactions").insert({
        tx_date: date,
        tx_type: "expense",
        payment_account_id: null,
        origin_account_id: null,
        destination_account_id: null,
        person_id: pid,
        category_id: catId,
        description: note || "Deuda registrada (sin salida de dinero)",
        amount_pen: value,
        amount_usd: 0,
        currency: "PEN",
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["categories"] }),
        qc.invalidateQueries({ queryKey: ["people"] }),
      ]);
      toast.success("Deuda registrada");
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-primary" /> Registrar deuda
          </DialogTitle>
          <DialogDescription>
            Para ventas o cosas que alguien te debe. No sale dinero de tus cuentas ni cuenta como gasto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Persona</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                <SelectItem value={NEW}>+ Nueva persona</SelectItem>
              </SelectContent>
            </Select>
            {personId === NEW && (
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Monto (S/)</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Comentario</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Entrada concierto" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</> : "Registrar deuda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarDeudaDialog;
