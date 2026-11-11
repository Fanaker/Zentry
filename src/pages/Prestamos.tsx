import { useIsMobile } from "@/hooks/use-mobile";
import { useMemo, useRef, useState } from "react";
import { useTransactions, useCategories, usePeople } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatPEN, formatDate, monthsList } from "@/lib/format";
import { ChevronRight, Users, HandCoins, CheckCircle2, FileDown, HandHeart, FilePlus2 } from "lucide-react";
import { PrestamoReportDialog } from "@/components/PrestamoReportDialog";
import { SaldarDeudaDialog, SETTLE_CATEGORY_NAME } from "@/components/SaldarDeudaDialog";
import { RegistrarDeudaDialog } from "@/components/RegistrarDeudaDialog";

const ALL = "__all__";

const Prestamos = () => {
  const { data: txs = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();

  const [year, setYear] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const detailRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const showDetail = isMobile && selectedPersonId !== null;
  const [reportOpen, setReportOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);


  const loanCat = categories.find((c) => (c.system_code === "loan_given" || c.name === "Préstamos / Deudas") && c.tx_type === "expense");
  const repayCat = categories.find((c) => (c.system_code === "loan_repayment" || c.name === "Deudas Cobradas") && c.tx_type === "income");
  const settleCat = categories.find((c) => (c.system_code === "debt_settled" || c.name === SETTLE_CATEGORY_NAME) && c.tx_type === "income");

  const years = useMemo(() => {
    const ys = new Set<string>();
    txs.forEach((t) => ys.add(t.tx_date.slice(0, 4)));
    return Array.from(ys).sort().reverse();
  }, [txs]);

  const filterByDate = (dateStr: string) => {
    if (year !== ALL && !dateStr.startsWith(year)) return false;
    if (month !== ALL && dateStr.slice(5, 7) !== month.padStart(2, "0")) return false;
    return true;
  };

  // For each person: total lent, total repaid, balance owed
  const summary = useMemo(() => {
    return people.map((p) => {
      const lent = txs.filter(
        (t) => t.person_id === p.id && t.category_id === loanCat?.id
      );
      const repaid = txs.filter(
        (t) => t.person_id === p.id && t.category_id === repayCat?.id
      );
      const settled = txs.filter(
        (t) => t.person_id === p.id && settleCat?.id && t.category_id === settleCat.id
      );
      const totalLent = lent.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
      const totalRepaid = repaid.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
      const totalSettled = settled.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
      return {
        person: p,
        totalLent,
        totalRepaid,
        totalSettled,
        balance: totalLent - totalRepaid - totalSettled,
        lent: lent.filter(t=>filterByDate(t.tx_date)), repaid: repaid.filter(t=>filterByDate(t.tx_date)), settled: settled.filter(t=>filterByDate(t.tx_date)),
      };
    }).filter((s) => s.totalLent > 0 || s.totalRepaid > 0 || s.totalSettled > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [people, txs, loanCat, repayCat, settleCat, year, month]);

  const selected = summary.find((s) => s.person.id === selectedPersonId) ?? summary[0];


  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Préstamos y Deudas</h1>
          <p className="text-sm text-muted-foreground">Saldos acumulados. El filtro de fecha se aplica al historial de movimientos.</p>
        </div>
        <div className="flex gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todo</SelectItem>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todo el año</SelectItem>
              {monthsList.map((m, i) => (
                <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setReportOpen(true)}
            disabled={people.length === 0}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards: total lent, total repaid, outstanding */}
      {(() => {
        const totalLent = summary.reduce((s, x) => s + x.totalLent, 0);
        const totalRepaid = summary.reduce((s, x) => s + x.totalRepaid, 0);
        const totalSettled = summary.reduce((s, x) => s + x.totalSettled, 0);
        const totalOwed = summary.reduce((s, x) => s + Math.max(0, x.balance), 0);
        const activeDebtors = summary.filter((x) => x.balance > 0.01).length;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="glass-card border-warning/30 glow-on-hover">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center">
                  <HandCoins className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Total prestado</p>
                  <p className="text-xl font-bold">{formatPEN(totalLent)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-success/30 glow-on-hover">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/30 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Total cobrado</p>
                  <p className="text-xl font-bold">{formatPEN(totalRepaid)}</p>
                  {totalSettled > 0 && (
                    <p className="text-[10px] text-muted-foreground">+ {formatPEN(totalSettled)} condonado</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-destructive/40 glow-on-hover">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center">
                  <Users className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Me deben en total</p>
                  <p className="text-xl font-bold text-destructive">{formatPEN(totalOwed)}</p>
                  <p className="text-[10px] text-muted-foreground">{activeDebtors} deudor{activeDebtors === 1 ? "" : "es"} activo{activeDebtors === 1 ? "" : "s"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className={`glass-card min-w-0 lg:col-span-1 ${showDetail ? "hidden" : ""}`}>
          <CardHeader className="pb-2 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Personas
            </CardTitle>
            <Button size="sm" className="gap-1.5" onClick={() => setDebtOpen(true)}>
              <FilePlus2 className="h-4 w-4" /> Registrar Deuda
            </Button>
          </CardHeader>
          <CardContent className="p-2">
            {summary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No hay préstamos registrados con estos filtros.
              </p>
            ) : (
              <div className="space-y-1">
                {summary.map((s) => {
                  const active = (selected?.person.id === s.person.id);
                  const owes = s.balance > 0.01;
                  return (
                    <button
                      key={s.person.id}
                      onClick={() => {
                        listScroll.current = window.scrollY;
                        setSelectedPersonId(s.person.id);
                        if (isMobile) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
                      }}
                      className={`w-full flex items-center justify-between gap-2 p-3 rounded-lg text-left transition ${
                        active ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{s.person.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Prestado {formatPEN(s.totalLent)} · Pagado {formatPEN(s.totalRepaid)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={owes ? "bg-warning/20 text-warning border-warning/40" : "bg-success/20 text-success border-success/40"}>
                          {owes ? formatPEN(s.balance) : "Saldado"}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card ref={detailRef} className={`glass-card min-w-0 scroll-mt-16 lg:col-span-2 ${isMobile && !showDetail ? "hidden" : ""}`}>
          {showDetail && <Button variant="ghost" className="ml-4 mt-3" onClick={() => { setSelectedPersonId(null); requestAnimationFrame(() => window.scrollTo(0, listScroll.current)); }}>← Volver a personas</Button>}
          <CardHeader className="pb-2 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              {selected ? `Detalle · ${selected.person.name}` : "Selecciona una persona"}
            </CardTitle>
            {selected && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setSettleOpen(true)}>
                <HandHeart className="h-4 w-4" /> Saldar deuda
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {selected ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <Stat label="Prestado" value={formatPEN(selected.totalLent)} tone="warning" />
                  <Stat label="Pagado" value={formatPEN(selected.totalRepaid)} tone="success" />
                  <Stat label="Condonado" value={formatPEN(selected.totalSettled)} tone="muted" />
                  <Stat label="Saldo" value={formatPEN(selected.balance)} tone={selected.balance > 0 ? "destructive" : "muted"} />
                </div>

                <Tabs key={selected.person.id} defaultValue="loans">
                  <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
                    <TabsTrigger value="loans" className="min-w-0 whitespace-normal break-words px-1 text-xs sm:text-sm">Préstamos</TabsTrigger>
                    <TabsTrigger value="paid" className="min-w-0 whitespace-normal break-words px-1 text-xs sm:text-sm">Cobros</TabsTrigger>
                    <TabsTrigger value="settled" className="min-w-0 whitespace-normal break-words px-1 text-xs sm:text-sm">Condonadas</TabsTrigger>
                  </TabsList>
                  <TabsContent value="loans" className="mt-3">
                    <DetailList items={selected.lent} emptyText="Sin préstamos en el rango seleccionado." />
                  </TabsContent>
                  <TabsContent value="paid" className="mt-3">
                    <DetailList items={selected.repaid} emptyText="Sin pagos recibidos en el rango seleccionado." />
                  </TabsContent>
                  <TabsContent value="settled" className="mt-3">
                    <DetailList items={selected.settled} emptyText="Sin deudas saldadas sin pago en el rango seleccionado." />
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">
                No hay datos para mostrar.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <PrestamoReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        people={people}
        transactions={txs}
        loanCatId={loanCat?.id}
        repayCatId={repayCat?.id}
        settleCatId={settleCat?.id}
        defaultPersonId={selected?.person.id ?? null}
      />

      <RegistrarDeudaDialog
        open={debtOpen}
        onOpenChange={setDebtOpen}
        people={people}
        defaultPersonId={selected?.person.id}
        loanCatId={loanCat?.id}
      />

      <SaldarDeudaDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        personId={selected?.person.id}
        personName={selected?.person.name}
        pendingBalance={selected?.balance ?? 0}
        settleCatId={settleCat?.id}
      />

    </div>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone: "warning" | "success" | "destructive" | "muted" }) => {
  const toneClass =
    tone === "warning" ? "text-warning" :
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
};

const DetailList = ({ items, emptyText }: { items: any[]; emptyText: string }) => {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{emptyText}</p>;
  }
  return (
    <div className="divide-y divide-border/40">
      {items
        .slice()
        .sort((a, b) => (b.tx_date.localeCompare(a.tx_date)))
        .map((t) => (
          <div key={t.id} className="flex justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="text-sm">{formatDate(t.tx_date)}</div>
              <div className="text-xs text-muted-foreground truncate">{t.description ?? "Sin comentario"}</div>
            </div>
            <span className="text-sm font-semibold">{formatPEN(t.amount_pen)}</span>
          </div>
        ))}
    </div>
  );
};

export default Prestamos;
