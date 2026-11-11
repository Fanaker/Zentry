import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useMonthlyClosings, useTransactions } from "@/hooks/useFinanceData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPEN, formatUSD, formatDate, monthsList, monthName } from "@/lib/format";
import { computeBalanceUpTo, lastDayOfMonth } from "@/lib/balanceCalc";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Save, CreditCard, Wallet, Landmark, Banknote, TrendingDown, TrendingUp, History, Trash2 } from "lucide-react";

const typeIcon = (t: string) => {
  if (t === "credit") return CreditCard;
  if (t === "cash") return Banknote;
  if (t === "bank") return Landmark;
  return Wallet;
};

// Accounts excluded from the global "diferencias" sum (PEN only)
const EXCLUDED_FROM_DIFF_SUM = ["Negocio Papá", "Otros - Exterior"];

const CierreMensual = () => {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const { data: closings = [] } = useMonthlyClosings();
  const { data: txs = [] } = useTransactions();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const cutoff = useMemo(() => lastDayOfMonth(year, month), [year, month]);

  const closingsByAccount = useMemo(() => {
    const m = new Map<string, any>();
    closings
      .filter((c: any) => c.year === year && c.month === month)
      .forEach((c: any) => m.set(c.account_id, c));
    return m;
  }, [closings, year, month]);

  // Calculated balance per account at cutoff (end of selected month)
  const calcByAccount = useMemo(() => {
    const m = new Map<string, { pen: number; usd: number }>();
    accounts.forEach((a) => m.set(a.id, computeBalanceUpTo(a, txs, closings, cutoff)));
    return m;
  }, [accounts, txs, closings, cutoff]);

  const [draft, setDraft] = useState<Record<string, Partial<{ value: string; notes: string }>>>({});

  // Reset drafts when month/year changes
  const monthKey = `${year}-${month}`;
  const [lastKey, setLastKey] = useState(monthKey);
  if (lastKey !== monthKey) {
    setLastKey(monthKey);
    setDraft({});
  }

  const handleSave = async (accountId: string, currency: "PEN" | "USD") => {
    if (!isAdmin) return;
    const d = draft[accountId];
    const existing = closingsByAccount.get(accountId);
    const value = d?.value !== undefined ? Number(d.value) : Number(
      currency === "USD" ? existing?.real_balance_usd ?? 0 : existing?.real_balance_pen ?? 0
    );
    const notes = d?.notes !== undefined ? d.notes : (existing?.notes ?? "");

    const payload = {
      account_id: accountId,
      year,
      month,
      real_balance_pen: currency === "PEN" ? value : 0,
      real_balance_usd: currency === "USD" ? value : 0,
      notes,
    };

    const { error } = await supabase
      .from("monthly_closings")
      .upsert(payload, { onConflict: "account_id,year,month" });
    if (error) toast.error(error.message);
    else {
      toast.success("Cierre guardado");
      qc.invalidateQueries({ queryKey: ["monthly_closings"] });
    }
  };

  const years = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i);

  const typeOrder: Record<string, number> = { credit: 0, bank: 1, cash: 2 };
  const sortAccounts = (list: any[]) =>
    [...list].sort((a, b) => {
      const ta = typeOrder[a.account_type] ?? 99;
      const tb = typeOrder[b.account_type] ?? 99;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name, "es");
    });

  const penAccounts = sortAccounts(accounts.filter((a) => a.is_active && a.currency === "PEN"));
  const usdAccounts = sortAccounts(accounts.filter((a) => a.is_active && a.currency === "USD"));

  // Totals of "real - calculated" for PEN accounts excluding the 2 listed
  const totalDiffPEN = useMemo(() => {
    let sum = 0;
    let counted = 0;
    penAccounts.forEach((a) => {
      if (!a.counts_as_real_money) return;
      const existing = closingsByAccount.get(a.id);
      if (!existing) return; // only count cards with a real value entered
      const real = Number(existing.real_balance_pen || 0);
      const calc = calcByAccount.get(a.id)?.pen ?? 0;
      sum += real - calc;
      counted++;
    });
    return { sum, counted };
  }, [penAccounts, closingsByAccount, calcByAccount]);

  // ===== Historial de cierres =====
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyYear, setHistoryYear] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const accountName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );

  const historyYears = useMemo(
    () => Array.from(new Set(closings.map((c: any) => c.year))).sort((a: number, b: number) => b - a),
    [closings]
  );

  const historyRows = useMemo(() => {
    const filtered =
      historyYear === "all"
        ? closings
        : closings.filter((c: any) => String(c.year) === historyYear);
    return [...filtered].sort((a: any, b: any) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return (accountName.get(a.account_id) ?? "").localeCompare(
        accountName.get(b.account_id) ?? "",
        "es"
      );
    });
  }, [closings, historyYear, accountName]);

  const formatDateTime = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${formatDate(iso.slice(0, 10))} · ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  };

  const handleDeleteClosing = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("monthly_closings")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Cierre eliminado");
      qc.invalidateQueries({ queryKey: ["monthly_closings"] });
    }
    setDeleteTarget(null);
  };

  const renderCard = (a: any, currency: "PEN" | "USD") => {
    const existing = closingsByAccount.get(a.id);
    const d = draft[a.id] ?? {};
    const existingValue = currency === "USD" ? existing?.real_balance_usd : existing?.real_balance_pen;
    const Icon = typeIcon(a.account_type);
    const calc = calcByAccount.get(a.id) ?? { pen: 0, usd: 0 };
    const calcValue = currency === "USD" ? calc.usd : calc.pen;
    const fmt = currency === "USD" ? formatUSD : formatPEN;

    // Diff uses draft value if present, else stored value, else null
    const realRaw =
      d?.value !== undefined && d.value !== ""
        ? Number(d.value)
        : existingValue !== undefined && existingValue !== null
          ? Number(existingValue)
          : null;
    const diff = realRaw !== null ? realRaw - calcValue : null;
    const diffColor =
      diff === null
        ? "text-muted-foreground"
        : diff < 0
          ? "text-destructive"
          : diff > 0
            ? "text-success"
            : "text-foreground";

    return (
      <Card
        key={a.id}
        className="bg-card/40 border-border/40 hover:border-primary/40 transition-colors"
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{a.name}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{a.account_type}</div>
            </div>
          </div>

          {/* Saldo real + Saldo calculado */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                Saldo real ({currency === "USD" ? "$" : "S/"})
              </label>
              <Input
                type="number"
                step="0.01"
                value={d?.value ?? (existingValue ?? "")}
                placeholder="0.00"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, [a.id]: { ...d, value: e.target.value } }))
                }
                disabled={!isAdmin}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                Saldo calculado
              </label>
              <div className="mt-1 h-9 px-3 flex items-center rounded-md border border-border/40 bg-muted/30 text-sm font-medium tabular-nums">
                {fmt(calcValue)}
              </div>
            </div>
          </div>

          {/* Notas + Diferencia */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                Notas
              </label>
              <Input
                value={d?.notes ?? (existing?.notes ?? "")}
                placeholder="—"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, [a.id]: { ...d, notes: e.target.value } }))
                }
                disabled={!isAdmin}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                Diferencia
              </label>
              <div className={`mt-1 h-9 px-3 flex items-center rounded-md border border-border/40 bg-muted/30 text-sm font-semibold tabular-nums ${diffColor}`}>
                {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
              </div>
            </div>
          </div>

          {isAdmin && (
            <Button size="sm" className="w-full" onClick={() => handleSave(a.id, currency)}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  const diffSign = totalDiffPEN.sum;
  const diffSumColor =
    totalDiffPEN.counted === 0
      ? "text-muted-foreground"
      : diffSign < 0
        ? "text-destructive"
        : diffSign > 0
          ? "text-success"
          : "text-foreground";
  const DiffIcon = diffSign < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cierre Mensual</h1>
          <p className="text-sm text-muted-foreground">
            Registra el saldo real al fin de mes. Será el punto de partida del siguiente mes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" className="h-10" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1.5" /> Historial de cierres
          </Button>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthsList.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <div
            className="h-10 px-3 flex items-center gap-2 rounded-md border border-border/40 bg-card/40"
            title="Suma de (Saldo real − Saldo calculado) de las cuentas en Soles, excluyendo Negocio Papá y Otros - Exterior"
          >
            <DiffIcon className={`h-3.5 w-3.5 ${diffSumColor}`} />
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase text-muted-foreground tracking-wider">Σ Diferencias S/</span>
              <span className={`text-sm font-bold tabular-nums ${diffSumColor}`}>
                {totalDiffPEN.counted === 0
                  ? "—"
                  : `${diffSign > 0 ? "+" : ""}${formatPEN(diffSign)}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {monthName(month)} {year} · Soles
          </h2>
        </div>
        {penAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No hay cuentas en Soles.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {penAccounts.map((a) => renderCard(a, "PEN"))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-success" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {monthName(month)} {year} · Dólares
          </h2>
        </div>
        {usdAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No hay cuentas en Dólares.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {usdAccounts.map((a) => renderCard(a, "USD"))}
          </div>
        )}
      </section>

      {/* Historial de cierres guardados */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Historial de cierres mensuales</DialogTitle>
            <DialogDescription>
              Todos los cierres guardados. Al eliminar uno, el saldo calculado de los meses
              posteriores se recalcula automáticamente desde el cierre anterior.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 pb-2">
            <Select value={historyYear} onValueChange={setHistoryYear}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los años</SelectItem>
                {historyYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {historyRows.length} {historyRows.length === 1 ? "registro" : "registros"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {historyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay cierres guardados{historyYear !== "all" ? ` en ${historyYear}` : ""}.
              </p>
            ) : (
              historyRows.map((c: any) => {
                const pen = Number(c.real_balance_pen || 0);
                const usd = Number(c.real_balance_usd || 0);
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {accountName.get(c.account_id) ?? "Cuenta eliminada"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Registrado el {formatDateTime(c.created_at)}
                        {c.notes ? ` · ${c.notes}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {monthName(c.month)} {c.year}
                    </Badge>
                    <div className="text-right text-sm font-semibold tabular-nums w-[120px] shrink-0">
                      {pen !== 0 ? (
                        <div>{formatPEN(pen)}</div>
                      ) : usd !== 0 ? (
                        <div>{formatUSD(usd)}</div>
                      ) : (
                        <div className="text-muted-foreground">S/ 0.00</div>
                      )}
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                        title="Eliminar cierre"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cierre mensual?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget &&
                `${accountName.get(deleteTarget.account_id) ?? "Cuenta"} · ${monthName(
                  deleteTarget.month
                )} ${deleteTarget.year}`}
              <br />
              El saldo calculado de los meses posteriores volverá a calcularse desde el cierre
              anterior a ese mes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteClosing}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CierreMensual;
