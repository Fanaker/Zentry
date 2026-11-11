import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useAccounts,
  useTransactions,
  useCategories,
  type Account,
  type Transaction,
} from "@/hooks/useFinanceData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPEN, formatUSD, formatDate, monthName } from "@/lib/format";
import {
  CreditCard,
  Save,
  CalendarRange,
  AlertCircle,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Build a billing cycle [start, end, payDue] for a given reference month/year.
 * The cycle ENDS in (refYear, refMonth) at endDay, and STARTS in the previous month at startDay.
 * Example: refMonth=Apr, startDay=23, endDay=22 -> 23/Mar -> 22/Abr, payDue ~15/May
 */
const computeCycleForMonth = (
  startDay: number,
  endDay: number,
  refYear: number,
  refMonth0: number, // 0-indexed month in which the cycle CLOSES
): { start: string; end: string; payDue: string } => {
  // End in refMonth0
  const lastDayEnd = new Date(refYear, refMonth0 + 1, 0).getDate();
  const realEndDay = Math.min(endDay, lastDayEnd);
  const end = `${refYear}-${String(refMonth0 + 1).padStart(2, "0")}-${String(realEndDay).padStart(2, "0")}`;

  // Start in previous month
  let startY = refYear;
  let startM = refMonth0 - 1;
  if (startM < 0) {
    startM = 11;
    startY -= 1;
  }
  const lastDayStart = new Date(startY, startM + 1, 0).getDate();
  const realStartDay = Math.min(startDay, lastDayStart);
  const start = `${startY}-${String(startM + 1).padStart(2, "0")}-${String(realStartDay).padStart(2, "0")}`;

  // Pay due ~15 of next month after end
  let payY = refYear;
  let payM = refMonth0 + 1;
  if (payM > 11) {
    payM = 0;
    payY += 1;
  }
  const payDue = `${payY}-${String(payM + 1).padStart(2, "0")}-15`;

  return { start, end, payDue };
};

/** Determine the closing month/year for the *current* cycle based on today */
const currentCycleMonth = (
  startDay: number,
  endDay: number,
  refDate = new Date(),
): { year: number; month0: number } => {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const day = refDate.getDate();
  // If today already past endDay this month, the active cycle closes NEXT month
  if (day > endDay) {
    let nm = m + 1;
    let ny = y;
    if (nm > 11) {
      nm = 0;
      ny += 1;
    }
    return { year: ny, month0: nm };
  }
  return { year: y, month0: m };
};

/** Sum charges within range */
const filterChargesInRange = (
  account: Account,
  txs: Transaction[],
  start: string,
  end: string,
): Transaction[] => {
  return txs.filter((t) => {
    if (t.tx_date < start || t.tx_date > end) return false;
    if (t.tx_type === "expense" && t.payment_account_id === account.id) return true;
    if (t.tx_type === "transfer" && t.origin_account_id === account.id) return true;
    return false;
  });
};

const sumCharges = (txs: Transaction[]) => {
  let pen = 0,
    usd = 0;
  txs.forEach((t) => {
    pen += Number(t.amount_pen || 0);
    usd += Number(t.amount_usd || 0);
  });
  return { pen, usd };
};

const MONTH_OPTIONS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const TarjetasCredito = () => {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const { data: txs = [] } = useTransactions();
  const { data: categories = [] } = useCategories();

  const cards = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type === "credit" && a.is_active)
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [accounts],
  );

  const today = new Date();
  const [filterYear, setFilterYear] = useState<number>(today.getFullYear());
  const [filterMonth0, setFilterMonth0] = useState<number>(today.getMonth());
  const [useCurrent, setUseCurrent] = useState<boolean>(true);

  // Years available: current year ± 3
  const years = useMemo(() => {
    const y = today.getFullYear();
    return [y - 3, y - 2, y - 1, y, y + 1];
  }, [today]);

  const [draft, setDraft] = useState<
    Record<string, { startDay: string; endDay: string }>
  >({});

  const [detailFor, setDetailFor] = useState<{
    account: Account;
    cycle: { start: string; end: string; payDue: string };
    txs: Transaction[];
  } | null>(null);

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "—";

  const handleSave = async (a: Account) => {
    if (!isAdmin) return;
    const d = draft[a.id];
    const startDay =
      d?.startDay !== undefined && d.startDay !== ""
        ? Number(d.startDay)
        : a.billing_start_day;
    const endDay =
      d?.endDay !== undefined && d.endDay !== ""
        ? Number(d.endDay)
        : a.billing_end_day;

    if (
      !startDay ||
      !endDay ||
      startDay < 1 ||
      startDay > 31 ||
      endDay < 1 ||
      endDay > 31
    ) {
      toast.error("Días deben estar entre 1 y 31");
      return;
    }

    const { error } = await supabase
      .from("accounts")
      .update({ billing_start_day: startDay, billing_end_day: endDay })
      .eq("id", a.id);

    if (error) toast.error(error.message);
    else {
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarjetas de Crédito</h1>
          <p className="text-sm text-muted-foreground">
            Configura los días de facturación y consulta el consumo de cualquier ciclo.
          </p>
        </div>

        {/* Filtro de periodo */}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground tracking-wider">
              Ciclo cierra en
            </Label>
            <div className="flex gap-2 mt-1">
              <Select
                value={useCurrent ? "current" : String(filterMonth0)}
                onValueChange={(v) => {
                  if (v === "current") {
                    setUseCurrent(true);
                  } else {
                    setUseCurrent(false);
                    setFilterMonth0(Number(v));
                  }
                }}
              >
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Ciclo actual</SelectItem>
                  {MONTH_OPTIONS.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(filterYear)}
                onValueChange={(v) => {
                  setUseCurrent(false);
                  setFilterYear(Number(v));
                }}
              >
                <SelectTrigger className="h-9 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          No tienes tarjetas de crédito activas.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((a) => {
            const d: { startDay?: string; endDay?: string } = draft[a.id] ?? {};
            const startDay = Number(
              d.startDay ?? a.billing_start_day ?? "",
            );
            const endDay = Number(d.endDay ?? a.billing_end_day ?? "");
            const configured = startDay >= 1 && endDay >= 1;

            // Decide which cycle (current vs filter)
            let cycle: { start: string; end: string; payDue: string } | null = null;
            let cycleLabel = "";
            if (configured) {
              if (useCurrent) {
                const { year, month0 } = currentCycleMonth(startDay, endDay);
                cycle = computeCycleForMonth(startDay, endDay, year, month0);
                cycleLabel = `${monthName(month0 + 1)} ${year}`;
              } else {
                cycle = computeCycleForMonth(
                  startDay,
                  endDay,
                  filterYear,
                  filterMonth0,
                );
                cycleLabel = `${MONTH_OPTIONS[filterMonth0]} ${filterYear}`;
              }
            }

            const charges = cycle
              ? filterChargesInRange(a, txs, cycle.start, cycle.end)
              : [];
            const sum = sumCharges(charges);
            const fmt = a.currency === "USD" ? formatUSD : formatPEN;
            const totalCharge = a.currency === "USD" ? sum.usd : sum.pen;

            return (
              <Card
                key={a.id}
                className="bg-card/40 border-border/40 hover:border-primary/40 transition-colors"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold truncate">
                        {a.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.currency} · Crédito
                      </div>
                    </div>
                  </div>

                  {/* Configuración de días */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                        Inicio facturación
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={d.startDay ?? (a.billing_start_day ?? "")}
                        placeholder="Día (1-31)"
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            [a.id]: {
                              ...d,
                              startDay: e.target.value,
                              endDay:
                                d.endDay ?? String(a.billing_end_day ?? ""),
                            },
                          }))
                        }
                        disabled={!isAdmin}
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                        Cierre facturación
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={d.endDay ?? (a.billing_end_day ?? "")}
                        placeholder="Día (1-31)"
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            [a.id]: {
                              ...d,
                              startDay:
                                d.startDay ??
                                String(a.billing_start_day ?? ""),
                              endDay: e.target.value,
                            },
                          }))
                        }
                        disabled={!isAdmin}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>

                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleSave(a)}
                    >
                      <Save className="h-3.5 w-3.5 mr-1.5" /> Guardar configuración
                    </Button>
                  )}

                  {/* Resumen del ciclo */}
                  {!configured ? (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-muted/30 border border-border/40">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Configura los días de facturación para ver el consumo.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <CalendarRange className="h-3.5 w-3.5" />
                          <span>
                            {cycleLabel} ·{" "}
                            <span className="font-medium text-foreground">
                              {formatDate(cycle!.start)}
                            </span>{" "}
                            →{" "}
                            <span className="font-medium text-foreground">
                              {formatDate(cycle!.end)}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">
                          Consumo del ciclo
                        </span>
                        <span className="text-2xl font-bold tabular-nums">
                          {fmt(totalCharge)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">
                          Pago aproximado antes del
                        </span>
                        <span className="font-semibold text-primary">
                          {formatDate(cycle!.payDue)}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full mt-2 text-xs"
                        disabled={charges.length === 0}
                        onClick={() =>
                          setDetailFor({
                            account: a,
                            cycle: cycle!,
                            txs: charges,
                          })
                        }
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Ver detalle ({charges.length})
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog detalle de movimientos */}
      <Dialog open={!!detailFor} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailFor?.account.name} — Movimientos del ciclo
            </DialogTitle>
            <DialogDescription>
              {detailFor &&
                `${formatDate(detailFor.cycle.start)} → ${formatDate(detailFor.cycle.end)}`}
            </DialogDescription>
          </DialogHeader>
          {detailFor && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Comentario</TableHead>
                    <TableHead className="text-right w-[120px]">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...detailFor.txs]
                    .sort((a, b) => a.tx_date.localeCompare(b.tx_date))
                    .map((t) => {
                      const fmt =
                        detailFor.account.currency === "USD"
                          ? formatUSD
                          : formatPEN;
                      const amount =
                        detailFor.account.currency === "USD"
                          ? t.amount_usd
                          : t.amount_pen;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs">
                            {formatDate(t.tx_date)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {categoryName(t.category_id)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.description || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-medium">
                            {fmt(Number(amount || 0))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell colSpan={3} className="text-xs">
                      Total
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {(detailFor.account.currency === "USD"
                        ? formatUSD
                        : formatPEN)(
                        detailFor.txs.reduce(
                          (s, t) =>
                            s +
                            Number(
                              detailFor.account.currency === "USD"
                                ? t.amount_usd
                                : t.amount_pen,
                            ),
                          0,
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TarjetasCredito;
