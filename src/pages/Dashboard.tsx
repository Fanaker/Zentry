import {limaDate} from "@/lib/dates";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccounts, useCategories, useTransactions, type Transaction } from "@/hooks/useFinanceData";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPEN, formatUSD, formatDate, monthName, monthsList } from "@/lib/format";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, CalendarDays,
  ChevronLeft, ChevronRight, Plus, PiggyBank, Receipt, Sparkles,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import TransactionFormDialog from "@/components/TransactionFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const CHART_COLORS = [
  "hsl(var(--chart-1))","hsl(var(--chart-2))","hsl(var(--chart-3))","hsl(var(--chart-4))","hsl(var(--chart-5))",
  "hsl(var(--chart-6))","hsl(var(--chart-7))","hsl(var(--chart-8))","hsl(var(--chart-9))","hsl(var(--chart-10))",
];

const isExtraordinary = (accountId: string | null, accountsById: Map<string, any>) => {
  if (!accountId) return false;
  const a = accountsById.get(accountId);
  return a?.counts_as_real_money === false;
};

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: txs = [] } = useTransactions();

  const today = new Date();
  const [year, setYear] = useState<number | "all">(today.getFullYear());
  const [month, setMonth] = useState<number | "all">(today.getMonth() + 1);
  const [newTxOpen, setNewTxOpen] = useState(false);
  const [listView, setListView] = useState<null | "income" | "expense">(null);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const navMonth = (delta: number) => {
    if (year === "all" || month === "all") return;
    let y = year;
    let m = month + delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setYear(y); setMonth(m);
  };

  const years = useMemo(() => {
    const ys = new Set<number>([today.getFullYear()]);
    txs.forEach((t) => ys.add(parseInt(t.tx_date.slice(0, 4))));
    return Array.from(ys).sort((a, b) => b - a);
  }, [txs]);

  const periodLabel =
    year === "all" ? "histórico"
    : month === "all" ? `${year}`
    : `${monthName(month)} ${year}`;

  const monthTxs = useMemo(() => {
    return txs.filter((t) => {
      const [y, m] = t.tx_date.split("-").map(Number);
      if (year !== "all" && y !== year) return false;
      if (month !== "all" && m !== month) return false;
      return true;
    });
  }, [txs, year, month]);

  // Filter out extraordinary accounts + settled-debt records (no real cash) from dashboard totals
  const isCounted = (t: Transaction) =>
    !((t.tx_type === "income" || t.tx_type === "expense") && !t.payment_account_id) &&
    !isExtraordinary(t.payment_account_id, accountsById) &&
    !isExtraordinary(t.origin_account_id, accountsById) &&
    !isExtraordinary(t.destination_account_id, accountsById);


  const totalIncome = monthTxs
    .filter((t) => t.tx_type === "income" && isCounted(t))
    .reduce((s, t) => s + Number(t.amount_pen || 0), 0);
  const totalIncomeUSD = monthTxs
    .filter((t) => t.tx_type === "income" && isCounted(t))
    .reduce((s, t) => s + Number(t.amount_usd || 0), 0);

  const totalExpense = monthTxs
    .filter((t) => t.tx_type === "expense" && isCounted(t))
    .reduce((s, t) => s + Number(t.amount_pen || 0), 0);
  const totalExpenseUSD = monthTxs
    .filter((t) => t.tx_type === "expense" && isCounted(t))
    .reduce((s, t) => s + Number(t.amount_usd || 0), 0);

  const balance = totalIncome - totalExpense;
  const balanceUSD = totalIncomeUSD - totalExpenseUSD;

  // Pie data for expenses
  const expensePie = useMemo(() => {
    const map = new Map<string, { name: string; value: number; categoryId: string }>();
    monthTxs.filter((t) => t.tx_type === "expense" && isCounted(t)).forEach((t) => {
      const cat = t.category_id ? categoriesById.get(t.category_id) : null;
      const name = cat?.name ?? "Sin categoría";
      const key = t.category_id ?? "none";
      const cur = map.get(key) ?? { name, value: 0, categoryId: key };
      cur.value += Number(t.amount_pen || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [monthTxs, categoriesById]);

  const incomePie = useMemo(() => {
    const map = new Map<string, { name: string; value: number; categoryId: string }>();
    monthTxs.filter((t) => t.tx_type === "income" && isCounted(t)).forEach((t) => {
      const cat = t.category_id ? categoriesById.get(t.category_id) : null;
      const name = cat?.name ?? "Sin categoría";
      const key = t.category_id ?? "none";
      const cur = map.get(key) ?? { name, value: 0, categoryId: key };
      cur.value += Number(t.amount_pen || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [monthTxs, categoriesById]);

  // Trend: per month of the selected year, or per year when "Histórico"
  const yearTrend = useMemo(() => {
    if (year === "all") {
      const map = new Map<number, { month: string; ingresos: number; gastos: number; m: number }>();
      txs.forEach((t) => {
        const [y] = t.tx_date.split("-").map(Number);
        if (!isCounted(t)) return;
        const cur = map.get(y) ?? { month: String(y), ingresos: 0, gastos: 0, m: y };
        if (t.tx_type === "income") cur.ingresos += Number(t.amount_pen || 0);
        if (t.tx_type === "expense") cur.gastos += Number(t.amount_pen || 0);
        map.set(y, cur);
      });
      return Array.from(map.values()).sort((a, b) => a.m - b.m);
    }
    const arr = monthsList.map((label, i) => ({ month: label.slice(0, 3), ingresos: 0, gastos: 0, m: i + 1 }));
    txs.forEach((t) => {
      const [y, m] = t.tx_date.split("-").map(Number);
      if (y !== year || !isCounted(t)) return;
      if (t.tx_type === "income") arr[m - 1].ingresos += Number(t.amount_pen || 0);
      if (t.tx_type === "expense") arr[m - 1].gastos += Number(t.amount_pen || 0);
    });
    return arr;
  }, [txs, year, accountsById]);


  // Today's movements
  const todayStr = limaDate();
  const todayTxs = useMemo(
    () => txs.filter((t) => t.tx_date === todayStr).slice(0, 20),
    [txs, todayStr]
  );

  // Drill-down state
  const [expenseDrill, setExpenseDrill] = useState<string | null>(null);
  const [incomeDrill, setIncomeDrill] = useState<string | null>(null);

  const expenseDrillTxs = monthTxs.filter(
    (t) => t.tx_type === "expense" && isCounted(t) && t.category_id === expenseDrill
  );
  const incomeDrillTxs = monthTxs.filter(
    (t) => t.tx_type === "income" && isCounted(t) && t.category_id === incomeDrill
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary/20 border border-primary/30 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Tu panorama financiero</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Month navigator with arrows (only when a concrete month is selected) */}
          {year !== "all" && month !== "all" && (
            <div className="flex items-center bg-card/60 border border-border/60 rounded-lg backdrop-blur-md">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => navMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-4 py-1.5 min-w-[150px] text-center text-sm font-semibold border-x border-border/60">
                {monthName(month)} {year}
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => navMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el año</SelectItem>
              {monthsList.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(year)}
            onValueChange={(v) => {
              if (v === "all") { setYear("all"); setMonth("all"); }
              else setYear(Number(v));
            }}
          >
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Histórico</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          {isAdmin && (
            <Button onClick={() => setNewTxOpen(true)} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4 mr-1" /> Nuevo
            </Button>
          )}
        </div>
      </div>

      {/* TOP ROW: 3 KPI cards stacked + yearly trend on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:col-span-1">
          <KpiCard
            title={`Ingresos · ${periodLabel}`}
            value={formatPEN(totalIncome)}
            rawAmount={totalIncome}
            usd={totalIncomeUSD ? formatUSD(totalIncomeUSD) : null}
            icon={<PiggyBank className="h-5 w-5 text-success" />}
            color="success"
            onClick={() => setListView("income")}
          />
          <KpiCard
            title={`Gastos · ${periodLabel}`}
            value={formatPEN(totalExpense)}
            rawAmount={totalExpense}
            usd={totalExpenseUSD ? formatUSD(totalExpenseUSD) : null}
            icon={<Receipt className="h-5 w-5 text-destructive" />}
            color="destructive"
            onClick={() => setListView("expense")}
          />
          <KpiCard
            title="Balance"
            value={formatPEN(balance)}
            rawAmount={balance}
            usd={(totalIncomeUSD || totalExpenseUSD) ? formatUSD(balanceUSD) : null}
            icon={<Sparkles className="h-5 w-5 text-primary" />}
            color={balance >= 0 ? "primary" : "destructive"}
          />

        </div>

        <Card className="glass-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {year === "all" ? "Tendencia por año" : `Tendencia anual ${year}`}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={yearTrend}>
                <defs>
                  <linearGradient id="grad-income" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="grad-expense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    backdropFilter: "blur(12px)",
                  }}
                  formatter={(v: number) => formatPEN(v)}
                />
                <Bar dataKey="ingresos" name="Ingresos" fill="url(#grad-income)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="url(#grad-expense)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

          </CardContent>
        </Card>
      </div>

      {/* MIDDLE ROW: Expense pie + Income pie side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieCard
          title={`Gastos · ${periodLabel}`}
          data={expensePie}
          activeId={expenseDrill}
          onSlice={(id) => setExpenseDrill((prev) => (prev === id ? null : id))}
          emptyText="Sin gastos en este periodo"
        />
        <PieCard
          title={`Ingresos · ${periodLabel}`}
          data={incomePie}
          activeId={incomeDrill}
          onSlice={(id) => setIncomeDrill((prev) => (prev === id ? null : id))}
          emptyText="Sin ingresos en este periodo"

        />
      </div>

      {/* Drill-down details */}
      {expenseDrill && expenseDrillTxs.length > 0 && (
        <DrillDownCard
          title={`Detalle de gastos · ${categoriesById.get(expenseDrill)?.name ?? ""}`}
          txs={expenseDrillTxs}
          tone="destructive"
        />
      )}
      {incomeDrill && incomeDrillTxs.length > 0 && (
        <DrillDownCard
          title={`Detalle de ingresos · ${categoriesById.get(incomeDrill)?.name ?? ""}`}
          txs={incomeDrillTxs}
          tone="success"
        />
      )}

      {/* Today's movements */}
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Movimientos de hoy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No hay movimientos registrados hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {todayTxs.map((t, i) => {

                const cat = t.category_id ? categoriesById.get(t.category_id) : null;
                const acc = t.payment_account_id ? accountsById.get(t.payment_account_id) : null;
                const sign = t.tx_type === "income" ? "+" : t.tx_type === "expense" ? "-" : "";
                const tone =
                  t.tx_type === "income" ? "text-success" :
                  t.tx_type === "expense" ? "text-destructive" : "text-muted-foreground";
                return (
                  <div key={t.id} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }} className="stagger-item flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center bg-muted/50 ${tone}`}>
                        {t.tx_type === "income" ? <TrendingUp className="h-4 w-4" /> :
                         t.tx_type === "expense" ? <TrendingDown className="h-4 w-4" /> :
                         <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{cat?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {acc?.name ?? ""} {t.description ? `· ${t.description}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${tone}`}>
                      {sign}{Number(t.amount_pen) > 0 ? formatPEN(t.amount_pen) : formatUSD(t.amount_usd)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionFormDialog open={newTxOpen} onClose={() => setNewTxOpen(false)} initial={null} />

      <Dialog open={!!listView} onOpenChange={(o) => !o && setListView(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {listView === "income" ? "Ingresos" : "Gastos"} · {periodLabel}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const rows = monthTxs
              .filter((t) => t.tx_type === listView && isCounted(t))
              .sort((a, b) => (a.tx_date < b.tx_date ? 1 : -1));
            const total = rows.reduce((s, t) => s + Number(t.amount_pen || 0), 0);
            const totalUsd = rows.reduce((s, t) => s + Number(t.amount_usd || 0), 0);
            const tone = listView === "income" ? "text-success" : "text-destructive";
            if (rows.length === 0) {
              return <p className="text-sm text-muted-foreground py-8 text-center">Sin movimientos en este periodo.</p>;
            }
            return (
              <>
                <div className="text-sm flex justify-between border-b border-border/40 pb-2 mb-2">
                  <span className="text-muted-foreground">{rows.length} movimiento{rows.length !== 1 ? "s" : ""}</span>
                  <span className={`font-semibold ${tone}`}>
                    {formatPEN(total)}{totalUsd > 0 ? ` · ${formatUSD(totalUsd)}` : ""}
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(t.tx_date)}</TableCell>
                        <TableCell className="text-xs">{accountsById.get(t.payment_account_id ?? "")?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{t.category_id ? categoriesById.get(t.category_id)?.name ?? "—" : "—"}</TableCell>
                        <TableCell className="text-xs max-w-[260px] truncate">{t.description ?? "—"}</TableCell>
                        <TableCell className={`text-xs text-right font-medium ${tone}`}>
                          {Number(t.amount_pen) > 0 ? formatPEN(t.amount_pen) : formatUSD(t.amount_usd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Lightweight count-up: presentation-only, no data logic.
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

const KpiCard = ({
  title, value, usd, icon, color, onClick, rawAmount,
}: {
  title: string; value: string; usd: string | null;
  icon: React.ReactNode; color: "success" | "destructive" | "primary";
  onClick?: () => void;
  rawAmount?: number;
}) => {
  const animated = useCountUp(rawAmount ?? 0);
  const displayValue = rawAmount === undefined ? value : formatPEN(animated);
  const tone =
    color === "success" ? "tone-success" :
    color === "destructive" ? "tone-destructive" : "";
  const iconTone =
    color === "success" ? "from-success/25 to-success/5 border-success/30" :
    color === "destructive" ? "from-destructive/25 to-destructive/5 border-destructive/30" :
    "from-primary/25 to-primary/5 border-primary/30";
  return (
    <div
      className={`glass-card-elevated ${tone} p-5 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-eyebrow">{title}</p>
          <p className="num-display text-3xl md:text-4xl mt-2 leading-none">{displayValue}</p>
          {usd && <p className="text-xs text-muted-foreground mt-2 tabular-nums">≈ {usd}</p>}
        </div>
        <div className={`h-11 w-11 rounded-2xl border bg-gradient-to-br ${iconTone} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  );
};


const PieCard = ({
  title, data, activeId, onSlice, emptyText,
}: {
  title: string;
  data: { name: string; value: number; categoryId: string }[];
  activeId: string | null;
  onSlice: (id: string) => void;
  emptyText: string;
}) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">{emptyText}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  onClick={(d: any) => onSlice(d.categoryId)}
                  cursor="pointer"
                >
                  {data.map((d, i) => (
                    <Cell
                      key={d.categoryId}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      stroke={activeId === d.categoryId ? "hsl(var(--foreground))" : "transparent"}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => formatPEN(v)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-2">
              {data.map((d, i) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                const active = activeId === d.categoryId;
                return (
                  <button
                    key={d.categoryId}
                    onClick={() => onSlice(d.categoryId)}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-sm transition ${
                      active ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{d.name}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-medium">{formatPEN(d.value)}</span>
                      <span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DrillDownCard = ({ title, txs, tone }: { title: string; txs: Transaction[]; tone: "success" | "destructive" }) => {
  const toneClass = tone === "success" ? "text-success" : "text-destructive";
  return (
    <Card className="glass-card animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border/40">
          {txs.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 gap-3">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">{formatDate(t.tx_date)}</span>
                <span className="text-xs text-muted-foreground truncate">{t.description ?? "Sin comentario"}</span>
              </div>
              <span className={`text-sm font-semibold ${toneClass}`}>
                {Number(t.amount_pen) > 0 ? formatPEN(t.amount_pen) : formatUSD(t.amount_usd)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default Dashboard;
