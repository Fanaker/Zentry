import BackupTools from "@/components/BackupTools";
import {parseExcelRows,sha256} from "@/lib/excelImport";
import {saveBytes} from "@/lib/native";
import { limaDate } from "@/lib/dates";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useAccounts, useCategories, usePeople, useTransactions,
} from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileSpreadsheet, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { monthName } from "@/lib/format";

const TYPE_TO_ES: Record<string, string> = { expense: "Gasto", income: "Ingreso", transfer: "TI" };
const ES_TO_TYPE: Record<string, "expense" | "income" | "transfer"> = {
  "gasto": "expense", "ingreso": "income", "ti": "transfer",
};

const Datos = () => {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: txs = [], isSuccess: txReady, isFetching: txFetching } = useTransactions();
  const [preview,setPreview]=useState<any>(null);

  const { data: backups = [] } = useQuery({
    queryKey: ["backup_history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backup_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    const accById = new Map(accounts.map((a) => [a.id, a]));
    const catById = new Map(categories.map((c) => [c.id, c]));
    const personById = new Map(people.map((p) => [p.id, p]));

    const rows = txs.map((t) => {
      const [y, m] = t.tx_date.split("-").map(Number);
      const isTransfer = t.tx_type === "transfer";
      return {
        Fecha: t.tx_date,
        Mes: monthName(m),
        Tipo: TYPE_TO_ES[t.tx_type] ?? t.tx_type,
        "Medio de Pago": isTransfer ? "" : (accById.get(t.payment_account_id ?? "")?.name ?? ""),
        Origen: isTransfer ? (accById.get(t.origin_account_id ?? "")?.name ?? "") : "",
        Destino: isTransfer ? (accById.get(t.destination_account_id ?? "")?.name ?? "") : "",
        "Referente a": t.person_id ? (personById.get(t.person_id)?.name ?? "ND") : "ND",
        Categoría: t.category_id ? (catById.get(t.category_id)?.name ?? "") : "",
        Descripción: t.description ?? "",
        Soles: Number(t.amount_pen) || 0,
        Dólares: Number(t.amount_usd) || 0,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    const filename = `zentry-respaldo-${limaDate()}.xlsx`;
    saveBytes(filename,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",new Uint8Array(XLSX.write(wb,{type:"array",bookType:"xlsx"})));

    // Log backup event
    if (isAdmin) {
      await supabase.from("backup_history").insert({
        filename,
        record_count: rows.length,
        created_by: user?.id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["backup_history"] });
    }

    toast.success(`${rows.length} registros exportados`);
  };

  const handleImport = async (file: File) => {
    if (!isAdmin) return;
    setImporting(true);
    try {
      if(file.size>20*1024*1024)throw new Error("El Excel supera 20 MB");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf,{sheetRows:50002,cellHTML:false});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if(rows.length>50000)throw new Error("El Excel supera 50.000 movimientos");
      const parsed=parseExcelRows(rows,XLSX.SSF.parse_date_code);
      setPreview({rows:parsed,hash:await sha256(buf),filename:file.name});
      toast.info('Revisa la vista previa antes de importar');
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message ?? "Error al importar");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar / Exportar</h1>
        <p className="text-sm text-muted-foreground">Respaldo y migración de tus datos en formato Excel.</p>
      </div>

      <BackupTools/>
      {preview&&<section className="glass-card p-5 space-y-3"><h2 className="font-semibold">Vista previa: {preview.filename}</h2><p>{preview.rows.length} movimientos. Los nombres, descripciones y dos columnas de moneda se conservan. Los textos «Pendiente» no crean borradores.</p><p className="text-sm text-warning">El Excel no recupera cierres ni configuración de cuentas. Los tipos de cuentas nuevas se infieren; revísalos después. Un archivo reexportado con movimientos solapados puede duplicarlos: utiliza el respaldo completo para migrar.</p><div className="max-h-64 overflow-auto"><table className="w-full text-xs"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cuenta / Origen → Destino</th><th>PEN</th><th>USD</th></tr></thead><tbody>{preview.rows.map((r:any,i:number)=><tr key={i}><td>{r.tx_date}</td><td>{r.tx_type}</td><td>{r.payment_account||`${r.origin_account} → ${r.destination_account}`}</td><td>{r.amount_pen}</td><td>{r.amount_usd}</td></tr>)}</tbody></table></div><Button disabled={importing} onClick={async()=>{setImporting(true);try{const {data,error}=await(supabase as any).rpc('import_excel',{p_rows:preview.rows,p_source_hash:preview.hash});if(error)throw error;toast.success(`${data} movimientos importados`);setPreview(null);qc.invalidateQueries();}catch(e){toast.error(e.message);}finally{setImporting(false);}}}>Confirmar importación</Button><Button variant="ghost" onClick={()=>setPreview(null)}>Cancelar</Button></section>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" /> Exportar respaldo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Genera un Excel con todos tus movimientos en el mismo orden de columnas:
              <span className="block mt-1 font-mono text-[11px]">
                Fecha · Mes · Tipo · Medio de Pago · Origen · Destino · Referente a · Categoría · Descripción · Soles · Dólares
              </span>
            </p>
            <Button disabled={!txReady || txFetching} onClick={handleExport} className="w-full">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Descargar Excel
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Importar desde Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sube tu archivo .xlsx con la estructura clásica. Las cuentas que empiezan con
              <span className="font-mono"> "C." </span> se marcan como crédito, las que inician con
              <span className="font-mono"> "Dólares" </span> como cuentas en dólares, "Efectivo" como efectivo y el resto como débito.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={!isAdmin || importing}
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer disabled:opacity-50"
            />
            {importing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Importando…
              </div>
            )}
            {!isAdmin && (
              <p className="text-xs text-warning">Solo los administradores pueden importar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Historial de respaldos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aún no has generado ningún respaldo. Cuando exportes un Excel, se registrará aquí la fecha y hora.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {backups.map((b: any) => {
                const d = new Date(b.created_at);
                const fecha = d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
                const hora = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={b.id} className="flex justify-between items-center gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{fecha} · {hora}</div>
                      <div className="text-xs text-muted-foreground truncate">{b.filename}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-md bg-primary/15 text-primary border border-primary/30">
                      {b.record_count} registros
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Datos;
