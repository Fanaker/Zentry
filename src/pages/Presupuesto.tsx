import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBudgets, useCategories, useTransactions, useAccounts } from "@/hooks/useFinanceData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPEN, monthsList, monthName } from "@/lib/format";
import { Save, Target } from "lucide-react";
import { toast } from "sonner";

const Presupuesto = () => {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const { data: txs = [] } = useTransactions();
  const {data:accounts=[]}=useAccounts();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const expenseCats = useMemo(
    () =>
      categories
        .filter((c) => c.tx_type === "expense")
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [categories]
  );

  const budgetMap = useMemo(() => {
    const m = new Map<string, number>();
    budgets
      .filter((b: any) => b.year === year && b.month === month)
      .forEach((b: any) => m.set(b.category_id, Number(b.amount_pen)));
    return m;
  }, [budgets, year, month]);

  const spentMap = useMemo(() => {
    const m = new Map<string, number>();
    txs.forEach((t) => {
      if (t.tx_type !== "expense" || !t.category_id || !t.payment_account_id || !accounts.find(a=>a.id===t.payment_account_id)?.counts_as_real_money) return;
      const [y, mo] = t.tx_date.split("-").map(Number);
      if (y !== year || mo !== month) return;
      m.set(t.category_id, (m.get(t.category_id) ?? 0) + Number(t.amount_pen || 0));
    });
    return m;
  }, [txs, accounts, year, month]);

  const [draft, setDraft] = useState<Record<string, string>>({});

  const handleSave = async (categoryId: string) => {
    const v = Number(draft[categoryId] ?? budgetMap.get(categoryId) ?? 0);
    const { error } = await supabase
      .from("budgets")
      .upsert({ category_id: categoryId, year, month, amount_pen: v }, { onConflict: "category_id,year,month" });
    if (error) toast.error(error.message);
    else {
      toast.success("Presupuesto guardado");
      qc.invalidateQueries({ queryKey: ["budgets"] });
    }
  };

  const totalBudget = Array.from(budgetMap.values()).reduce((s, v) => s + v, 0);
  const totalSpent = Array.from(spentMap.values()).reduce((s, v) => s + v, 0);

  const years = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Presupuesto</h1>
          <p className="text-sm text-muted-foreground">{monthName(month)} {year} · Comparativa con gasto real.</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Presupuestado</p>
          <p className="text-xl font-bold mt-1">{formatPEN(totalBudget)}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gastado</p>
          <p className="text-xl font-bold mt-1 text-destructive">{formatPEN(totalSpent)}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Disponible</p>
          <p className={`text-xl font-bold mt-1 ${totalBudget - totalSpent < 0 ? "text-destructive" : "text-success"}`}>
            {formatPEN(totalBudget - totalSpent)}
          </p>
        </CardContent></Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Por categoría
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {expenseCats.map((c) => {
            const budget = Number(draft[c.id] ?? budgetMap.get(c.id) ?? 0);
            const spent = spentMap.get(c.id) ?? 0;
            const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const over = budget > 0 && spent > budget;
            return (
              <Card
                key={c.id}
                className="bg-card/40 border-border/40 hover:border-primary/40 transition-colors"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-sm font-medium truncate flex-1">{c.name}</div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                      Presupuesto (S/)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      defaultValue={budgetMap.get(c.id) ?? ""}
                      placeholder="0.00"
                      onChange={(e) => setDraft((p) => ({ ...p, [c.id]: e.target.value }))}
                      disabled={!isAdmin}
                      className="mt-1 h-9"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">
                        {formatPEN(spent)} <span className="opacity-50">/ {formatPEN(budget)}</span>
                      </span>
                      <span className={over ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={pct} className={over ? "[&>div]:bg-destructive" : ""} />
                  </div>

                  {isAdmin && (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => handleSave(c.id)}>
                      <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Presupuesto;
