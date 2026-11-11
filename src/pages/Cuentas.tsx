import { limaDate } from "@/lib/dates";
import { computeBalanceUpTo } from "@/lib/balanceCalc";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts, useTransactions, useMonthlyClosings, type Account, type Transaction } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPEN, formatUSD } from "@/lib/format";
import { CreditCard, Wallet, DollarSign, Banknote, Box, Ban } from "lucide-react";

const computeAccountBalance = (account: Account, txs: Transaction[], closings: any[]) => computeBalanceUpTo(account,txs,closings,limaDate(),true);

const ICONS = {
  cash: Banknote,
  debit: Wallet,
  credit: CreditCard,
  dollars: DollarSign,
  other: Box,
};

const Cuentas = () => {
  const navigate = useNavigate();
  const { data: allAccounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: closings = [] } = useMonthlyClosings();

  // Filter out hidden accounts from this view (still exist in DB and other screens)
  const accounts = useMemo(
    () => allAccounts.filter((a) => !a.hidden_in_accounts),
    [allAccounts],
  );

  const balances = useMemo(() => {
    const map = new Map<string, { pen: number; usd: number }>();
    allAccounts.forEach((a) => map.set(a.id, computeAccountBalance(a, txs, closings)));
    return map;
  }, [allAccounts, txs, closings]);

  // Total: everything in counts_as_real_money
  const totalAll = useMemo(() => {
    let pen = 0;
    allAccounts.forEach((a) => {
      if (!a.counts_as_real_money) return;
      const b = balances.get(a.id) ?? { pen: 0, usd: 0 };
      pen += a.currency === "USD" ? 0 : b.pen;
      pen += b.usd ? 0 : 0; // we keep USD separate
    });
    let usd = 0;
    allAccounts.forEach((a) => {
      if (!a.counts_as_real_money) return;
      const b = balances.get(a.id) ?? { pen: 0, usd: 0 };
      if (a.currency === "USD") usd += b.usd;
    });
    return { pen, usd };
  }, [allAccounts, balances]);

  // Real money: excludes credit + extraordinary + inactive
  const totalReal = useMemo(() => {
    let pen = 0, usd = 0;
    allAccounts.forEach((a) => {
      if (!a.counts_as_real_money) return;
      if (a.account_type === "credit") return;
      if (!a.is_active) return;
      const b = balances.get(a.id) ?? { pen: 0, usd: 0 };
      if (a.currency === "USD") usd += b.usd;
      else pen += b.pen;
    });
    return { pen, usd };
  }, [allAccounts, balances]);

  // Group accounts by type, but place inactive ("anuladas") at the end of each group
  const grouped = useMemo(() => {
    const groups: Record<string, Account[]> = { debit: [], credit: [], cash: [], dollars: [], other: [] };
    accounts.forEach((a) => groups[a.account_type]?.push(a));
    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    );
    return groups;
  }, [accounts]);

  const groupTitle: Record<string, string> = {
    debit: "Débito", credit: "Crédito", cash: "Efectivo", dollars: "Dólares", other: "Otros",
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cuentas</h1>
        <p className="text-sm text-muted-foreground">Saldos calculados desde el último cierre mensual.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card border-primary/30 glow-on-hover">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total disponible (incluye crédito)</p>
            <p className="text-3xl font-bold mt-2 gradient-text">{formatPEN(totalAll.pen)}</p>
            {totalAll.usd !== 0 && <p className="text-sm text-muted-foreground mt-1">{formatUSD(totalAll.usd)}</p>}
          </CardContent>
        </Card>
        <Card className="glass-card border-success/30 glow-on-hover">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Dinero real (sin crédito)</p>
            <p className="text-3xl font-bold mt-2 text-success">{formatPEN(totalReal.pen)}</p>
            {totalReal.usd !== 0 && <p className="text-sm text-muted-foreground mt-1">{formatUSD(totalReal.usd)}</p>}
          </CardContent>
        </Card>
      </div>

      {Object.entries(grouped).map(([type, accs]) => {
        if (accs.length === 0) return null;
        const Icon = (ICONS as any)[type] ?? Box;
        return (
          <div key={type}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4" />{groupTitle[type]}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accs.map((a) => {
                const b = balances.get(a.id) ?? { pen: 0, usd: 0 };
                const rawValue = a.currency === "USD" ? (b.usd) : b.pen;
                const value = a.currency === "USD" ? formatUSD(b.usd) : formatPEN(b.pen);
                const isNegative = rawValue < 0;
                return (
                  <Card
                    key={a.id}
                    onClick={() => navigate(`/movimientos?account=${a.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/movimientos?account=${a.id}`);
                      }
                    }}
                    className={`glass-card glow-on-hover cursor-pointer transition ${
                      !a.is_active ? "opacity-60 grayscale" : ""
                    }`}
                  >
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm flex items-center justify-between gap-2 text-foreground">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="truncate">{a.name}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!a.is_active && (
                            <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive gap-1">
                              <Ban className="h-3 w-3" /> Anulada
                            </Badge>
                          )}
                          {!a.counts_as_real_money && <Badge variant="outline" className="text-[10px]">Extraordinaria</Badge>}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-xl font-bold ${isNegative ? "text-destructive" : "text-foreground"}`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{a.currency}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Cuentas;
