import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveJSON } from "@/lib/native";
import { limaDate } from "@/lib/dates";
import { sha256 } from "@/lib/excelImport";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const backupTables = [
  "accounts", "categories", "people", "budgets", "monthly_closings", "transactions", "backup_history", "capture_drafts", "import_batches",
] as const;
type Backup = { format: "zentry-personal"; version: 2; tables: Record<typeof backupTables[number], unknown[]> };

export default function BackupTools() {
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<Backup | null>(null);

  async function exportBackup() {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("export_personal_backup");
      if (error) throw error;
      const checksum = await sha256(new TextEncoder().encode(JSON.stringify(data)));
      saveJSON(`zentry-completo-${limaDate()}.json`, { checksum, data });
      toast.success("Respaldo financiero completo preparado");
    } catch (error) {
      toast.error(error.message ?? "No se pudo extraer el respaldo.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRestore(file: File) {
    setRestore(null);
    setBusy(true);
    try {
      const { data, checksum } = JSON.parse(await file.text());
      if (data?.format !== "zentry-personal" || data.version !== 2
        || !backupTables.every((table) => Array.isArray(data.tables?.[table]))) {
        throw new Error("El archivo no tiene el formato de respaldo completo de Zentry.");
      }
      const sum = await sha256(new TextEncoder().encode(JSON.stringify(data)));
      if (sum !== checksum) throw new Error("El archivo no supera la verificación de integridad.");
      setRestore(data);
    } catch (error) {
      toast.error(error.message ?? "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function performRestore() {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("restore_personal_backup", { p_backup: restore });
      if (error) throw error;
      location.reload();
    } catch (error) {
      toast.error(error.message ?? "No se pudo restaurar el respaldo.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="glass-card p-4 sm:p-5 space-y-4">
    <h2 className="font-semibold text-lg">Respaldo completo</h2>
    <p className="text-sm text-muted-foreground">
      Incluye cuentas y su configuración, categorías, personas, movimientos, cierres, presupuestos y borradores.
    </p>
    <Button disabled={busy} onClick={() => exportBackup()}>Descargar respaldo completo</Button>
    <label className="block text-sm">
      Restaurar en un espacio vacío
      <input type="file" accept="application/json,.json" className="block mt-2 w-full" disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadRestore(file);
        }} />
    </label>
    {restore && <div className="space-y-3">
      <p className="text-sm">
        {restore.tables.transactions.length} movimientos · {restore.tables.accounts.length} cuentas · {restore.tables.categories.length} categorías
      </p>
      <p className="text-sm text-muted-foreground">
        La restauración conserva los identificadores y asigna los datos a tu usuario. Si hay un error, se revierte la operación completa.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={performRestore}>Restaurar este respaldo</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setRestore(null)}>Cancelar</Button>
      </div>
    </div>}
  </section>;
}
