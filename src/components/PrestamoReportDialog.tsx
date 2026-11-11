import { limaDate } from "@/lib/dates";
import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatPEN, formatDate, monthsList, monthName } from "@/lib/format";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Transaction, Person } from "@/hooks/useFinanceData";

const ALL = "__all__";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
  transactions: Transaction[];
  loanCatId?: string;
  repayCatId?: string;
  settleCatId?: string;
  defaultPersonId?: string | null;
};

export const PrestamoReportDialog = ({
  open, onOpenChange, people, transactions, loanCatId, repayCatId, settleCatId, defaultPersonId,
}: Props) => {
  const [personId, setPersonId] = useState<string>(defaultPersonId ?? people[0]?.id ?? "");
  const [year, setYear] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [busy, setBusy] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const ys = new Set<string>();
    transactions.forEach((t) => ys.add(t.tx_date.slice(0, 4)));
    return Array.from(ys).sort().reverse();
  }, [transactions]);

  const inRange = (date: string) => {
    if (year !== ALL && !date.startsWith(year)) return false;
    if (month !== ALL && date.slice(5, 7) !== month.padStart(2, "0")) return false;
    return true;
  };

  const person = people.find((p) => p.id === personId);

  const { lent, repaid, settled, totalLent, totalRepaid, totalSettled, balance } = useMemo(() => {
    const lent = transactions
      .filter((t) => t.person_id === personId && t.category_id === loanCatId && inRange(t.tx_date))
      .sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    const repaid = transactions
      .filter((t) => t.person_id === personId && t.category_id === repayCatId && inRange(t.tx_date))
      .sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    const settled = settleCatId
      ? transactions
          .filter((t) => t.person_id === personId && t.category_id === settleCatId && inRange(t.tx_date))
          .sort((a, b) => a.tx_date.localeCompare(b.tx_date))
      : [];
    const totalLent = lent.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
    const totalRepaid = repaid.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
    const totalSettled = settled.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
    return {
      lent, repaid, settled, totalLent, totalRepaid, totalSettled,
      balance: totalLent - totalRepaid - totalSettled,
    };
  }, [transactions, personId, loanCatId, repayCatId, settleCatId, year, month]);

  const periodLabel =
    year === ALL ? "Todo el historial"
    : month === ALL ? `Año ${year}`
    : `${monthName(Number(month))} ${year}`;


  const handleExport = async () => {
    if (!reportRef.current || !person) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const node = reportRef.current;
      const canvas = await html2canvas(node, {
        backgroundColor: "#0b0b14",
        scale: 2,
        useCORS: true,
        windowWidth: node.scrollWidth,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      if (imgH <= pageH - margin * 2) {
        pdf.addImage(imgData, "PNG", margin, margin, imgW, imgH);
      } else {
        // Multi-page: slice the canvas vertically
        const pageContentH = pageH - margin * 2;
        const pxPerPage = (pageContentH * canvas.width) / imgW;
        let rendered = 0;
        let pageIdx = 0;
        while (rendered < canvas.height) {
          const sliceH = Math.min(pxPerPage, canvas.height - rendered);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceData = sliceCanvas.toDataURL("image/png");
          if (pageIdx > 0) pdf.addPage();
          const sliceImgH = (sliceH * imgW) / canvas.width;
          pdf.addImage(sliceData, "PNG", margin, margin, imgW, sliceImgH);
          rendered += sliceH;
          pageIdx++;
        }
      }

      const safeName = person.name.replace(/[^a-z0-9-_]+/gi, "_");
      const periodSlug =
        year === ALL ? "historial"
        : month === ALL ? year
        : `${year}-${month.padStart(2, "0")}`;
      pdf.save(`Deudas_${safeName}_${periodSlug}.pdf`);
      toast.success("PDF generado");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" /> Exportar reporte de deudas
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Persona</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Selecciona una persona" /></SelectTrigger>
              <SelectContent>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Año</Label>
            <Select value={year} onValueChange={(v) => { setYear(v); if (v === ALL) setMonth(ALL); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todo</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Mes</Label>
            <Select value={month} onValueChange={setMonth} disabled={year === ALL}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todo el año</SelectItem>
                {monthsList.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-border/50 overflow-auto max-h-[50vh] bg-[#0b0b14] p-2">
          <div
            ref={reportRef}
            style={{ width: 760, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif", color: "#e6e6f0" }}
            className="p-8"
          >
            {/* Header */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(124,92,255,0.25), rgba(0,200,255,0.15))",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: 24,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: "#9aa0c0", textTransform: "uppercase" }}>
                    Resumen de deudas
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                    {person?.name ?? "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "#9aa0c0", marginTop: 4 }}>
                    Periodo: {periodLabel}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#9aa0c0", textTransform: "uppercase", letterSpacing: 1 }}>
                    Saldo pendiente
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      color: balance > 0.01 ? "#ff6b6b" : "#34d399",
                      marginTop: 4,
                    }}
                  >
                    {formatPEN(Math.max(0, balance))}
                  </div>
                  {balance <= 0.01 && (
                    <div style={{ fontSize: 11, color: "#34d399", marginTop: 2 }}>Saldado ✓</div>
                  )}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <Kpi label="Total prestado" value={formatPEN(totalLent)} color="#f5b96b" />
              <Kpi label="Total pagado" value={formatPEN(totalRepaid)} color="#34d399" />
              <Kpi label="Condonado" value={formatPEN(totalSettled)} color="#8ab4ff" />
              <Kpi label="Saldo" value={formatPEN(balance)} color={balance > 0.01 ? "#ff6b6b" : "#9aa0c0"} />
            </div>

            {/* Loans table */}
            <SectionTable
              title={`Préstamos otorgados (${lent.length})`}
              items={lent}
              accent="#f5b96b"
              emptyText="Sin préstamos en este periodo."
            />

            <div style={{ height: 16 }} />

            {/* Repayments table */}
            <SectionTable
              title={`Pagos recibidos (${repaid.length})`}
              items={repaid}
              accent="#34d399"
              emptyText="Sin pagos recibidos en este periodo."
            />

            {settled.length > 0 && (
              <>
                <div style={{ height: 16 }} />
                <SectionTable
                  title={`Deudas saldadas sin pago (${settled.length})`}
                  items={settled}
                  accent="#8ab4ff"
                  emptyText="—"
                />
              </>
            )}


            <div style={{ marginTop: 24, fontSize: 10, color: "#6e7396", textAlign: "center" }}>
              Generado el {formatDate(limaDate())} · Documento informativo
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleExport} disabled={busy || !person}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando…</> : <><FileDown className="h-4 w-4 mr-2" />Descargar PDF</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Kpi = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 14,
    }}
  >
    <div style={{ fontSize: 10, color: "#9aa0c0", textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
  </div>
);

const SectionTable = ({
  title, items, accent, emptyText,
}: { title: string; items: Transaction[]; accent: string; emptyText: string }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        fontSize: 13,
        fontWeight: 600,
        color: "#e6e6f0",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, display: "inline-block" }} />
      {title}
    </div>
    {items.length === 0 ? (
      <div style={{ padding: 20, fontSize: 12, color: "#9aa0c0", textAlign: "center" }}>{emptyText}</div>
    ) : (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.02)" }}>
            <th style={th}>Fecha</th>
            <th style={th}>Comentario</th>
            <th style={{ ...th, textAlign: "right" }}>Monto</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={td}>{formatDate(t.tx_date)}</td>
              <td style={{ ...td, color: "#c8cce0" }}>{t.description || "—"}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 600, color: accent }}>
                {formatPEN(Number(t.amount_pen || 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#9aa0c0",
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: "10px 16px", color: "#e6e6f0" };
