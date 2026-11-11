import { limaDate } from "@/lib/dates";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HandHeart, Loader2 } from "lucide-react";
import { formatPEN } from "@/lib/format";

export const SETTLE_CATEGORY_NAME = "Deuda Condonada";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId?: string;
  personName?: string;
  pendingBalance: number;
  settleCatId?: string;
};

export const SaldarDeudaDialog = ({
  open, onOpenChange, personId, personName, pendingBalance, settleCatId,
}: Props) => {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(limaDate());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(pendingBalance > 0 ? String(Number(pendingBalance.toFixed(2))) : "");
      setDate(limaDate());
      setNote("");
    }
  }, [open, pendingBalance]);

  const handleSave = async () => {
    const value = Number(amount);
    if (!personId) return;
    if (!value || value <= 0 || value > pendingBalance) {
      toast.error("Ingresa un monto válido");
      return;
    }
    setBusy(true);
    try {
      let catId = settleCatId;
      if (!catId) {
        const { data, error } = await supabase
          .from("categories")
          .insert({ name: SETTLE_CATEGORY_NAME, tx_type: "income" })
          .select("id")
          .single();
        if (error) throw error;
        catId = data.id;
      }

      const { error: txError } = await supabase.from("transactions").insert({
        tx_date: date,
        tx_type: "income",
        payment_account_id: null,
        origin_account_id: null,
        destination_account_id: null,
        person_id: personId,
        category_id: catId,
        description: note || "Deuda saldada de palabra (sin ingreso de dinero)",
        amount_pen: value,
        amount_usd: 0,
        currency: "PEN",
      });
      if (txError) throw txError;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["categories"] }),
      ]);
      toast.success("Deuda saldada registrada");
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
            <HandHeart className="h-5 w-5 text-primary" /> Saldar deuda
          </DialogTitle>
          <DialogDescription>
            Reduce el saldo de {personName ?? "la persona"} sin que ingrese dinero a ninguna de tus cuentas.
            Queda registrado como historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-muted/30 p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Saldo pendiente actual</span>
            <span className="font-semibold">{formatPEN(Math.max(0, pendingBalance))}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Monto a saldar (S/)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {pendingBalance > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setAmount(String(Number(pendingBalance.toFixed(2))))}
              >
                Saldar todo ({formatPEN(pendingBalance)})
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Comentario</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Saldado en apuesta de cartas"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</> : "Saldar deuda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaldarDeudaDialog;
