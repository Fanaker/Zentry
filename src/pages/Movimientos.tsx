import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useCategories, usePeople, useTransactions, type Transaction } from "@/hooks/useFinanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Eye, Search, Copy, GripVertical, SlidersHorizontal } from "lucide-react";
import TransactionFormDialog from "@/components/TransactionFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPEN, formatUSD, formatDate, monthName, monthsList } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { hasNativeVoice } from "@/lib/native";
import { toast } from "sonner";

const ALL = "__all__";
const MOBILE_VIEW_KEY = "zentry.movimientos.mobile-view";
const TYPE_LABEL = { expense: "Gasto", income: "Ingreso", transfer: "TI" };
const TYPE_TONE = {
  expense: "bg-destructive/15 text-destructive border-destructive/30",
  income: "bg-success/15 text-success border-success/30",
  transfer: "bg-primary/15 text-primary border-primary/30",
};

function receivedAmount(transaction: Transaction) {
  if (!transaction.destination_amount || !transaction.destination_currency) return "—";
  return transaction.destination_currency === "USD"
    ? formatUSD(transaction.destination_amount)
    : formatPEN(transaction.destination_amount);
}

const Movimientos = () => {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: txs = [] } = useTransactions();
  const narrowViewport = useIsMobile();
  const mobile = hasNativeVoice() || narrowViewport;
  const [mobileView, setMobileView] = useState<"simple" | "extended">(
    () => localStorage.getItem(MOBILE_VIEW_KEY) === "extended" ? "extended" : "simple",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const compact = mobile && mobileView === "simple";

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [year, setYear] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [accountFilter, setAccountFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [personFilter, setPersonFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [duplicating, setDuplicating] = useState<Transaction | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Transaction | null>(null);

  // Pre-fill the account filter when arriving from the Cuentas page (?account=<id>)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const acc = searchParams.get("account");
    if (acc) {
      setAccountFilter(acc);
      // Clear so future navigations don't re-apply the filter unexpectedly
      const next = new URLSearchParams(searchParams);
      next.delete("account");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(() => {
    const ys = new Set<string>();
    txs.forEach((t) => ys.add(t.tx_date.slice(0, 4)));
    return Array.from(ys).sort().reverse();
  }, [txs]);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (type !== ALL && t.tx_type !== type) return false;
      if (year !== ALL && !t.tx_date.startsWith(year)) return false;
      if (month !== ALL) {
        const m = t.tx_date.slice(5, 7);
        if (m !== month.padStart(2, "0")) return false;
      }
      if (accountFilter !== ALL) {
        if (t.payment_account_id !== accountFilter
          && t.origin_account_id !== accountFilter
          && t.destination_account_id !== accountFilter) return false;
      }
      if (categoryFilter !== ALL && t.category_id !== categoryFilter) return false;
      if (personFilter !== ALL) {
        if (personFilter === "__none__person__") {
          if (t.person_id) return false;
        } else if (t.person_id !== personFilter) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        const cat = t.category_id ? categoriesById.get(t.category_id)?.name ?? "" : "";
        const desc = t.description ?? "";
        if (!cat.toLowerCase().includes(s) && !desc.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [txs, type, year, month, accountFilter, categoryFilter, personFilter, search, categoriesById]);


  const visible = filtered;
  const activeFilters = [type, year, month, accountFilter, categoryFilter, personFilter]
    .filter((filter) => filter !== ALL).length;
  const tableColumns = (mobile ? 13 : 9) + Number(isAdmin);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const persistDayOrder = async (date: string, orderedIds: string[]) => {
    const updates = orderedIds.map((id, i) =>
      supabase.from("transactions").update({ day_order: i }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error)?.error;
    if (err) toast.error(err.message);
    else {
      toast.success("Orden actualizado");
      qc.invalidateQueries({ queryKey: ["transactions"] });
    }
  };

  const handleDrop = async (targetId: string) => {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const source = visible.find((t) => t.id === sourceId);
    const target = visible.find((t) => t.id === targetId);
    if (!source || !target) return;
    if (source.tx_date !== target.tx_date) {
      toast.error("Solo puedes reordenar movimientos del mismo día");
      return;
    }
    const dayIds = visible.filter((t) => t.tx_date === source.tx_date).map((t) => t.id);
    const from = dayIds.indexOf(sourceId);
    const to = dayIds.indexOf(targetId);
    dayIds.splice(to, 0, dayIds.splice(from, 1)[0]);
    await persistDayOrder(source.tx_date, dayIds);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este movimiento?")) return false;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Movimiento eliminado");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    return true;
  };

  const editMovement = (transaction: Transaction, duplicate = false) => {
    setViewing(null);
    setEditing(duplicate ? null : transaction);
    setDuplicating(duplicate ? transaction : null);
    setOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} registros</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setDuplicating(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo movimiento
          </Button>
        )}
      </div>

      <Card className="glass-card">
        <CardContent className="p-3 sm:p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <div className={mobile ? "col-span-2 flex gap-2" : "col-span-2"}>
            <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              aria-label="Buscar por categoría o descripción"
              placeholder={mobile ? "Buscar movimientos…" : "Buscar por categoría o descripción…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            </div>
            {mobile && <Button type="button" variant="outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
              <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Filtros{activeFilters > 0 ? ` (${activeFilters})` : ""}
            </Button>}
          </div>
          {activeFilters > 0 && <div className="col-span-full flex flex-wrap gap-1.5">
            {([
              [type, setType, TYPE_LABEL[type] ?? type],
              [year, setYear, year],
              [month, setMonth, monthsList[Number(month)-1] ?? month],
              [accountFilter, setAccountFilter, accountsById.get(accountFilter)?.name ?? "Cuenta"],
              [categoryFilter, setCategoryFilter, categoriesById.get(categoryFilter)?.name ?? "Categoría"],
              [personFilter, setPersonFilter, peopleById.get(personFilter)?.name ?? "Persona"],
            ] as const).map(([value, reset, label], index) => value !== ALL && (
              <Button key={index} size="sm" type="button" variant="secondary" className="h-8 max-w-full gap-1"
                aria-label={`Quitar filtro ${label}`} onClick={() => reset(ALL)}>
                <span className="truncate">{label}</span><span aria-hidden>×</span>
              </Button>
            ))}
          </div>}
          {(!mobile || filtersOpen) && <>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los tipos</SelectItem>
              <SelectItem value="expense">Gasto</SelectItem>
              <SelectItem value="income">Ingreso</SelectItem>
              <SelectItem value="transfer">TI</SelectItem>
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los años</SelectItem>
              {years.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los meses</SelectItem>
              {monthsList.map((m, i) => (
                <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger><SelectValue placeholder="Cuenta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las cuentas</SelectItem>
              {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las categorías</SelectItem>
              {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger><SelectValue placeholder="Persona" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las personas</SelectItem>
              <SelectItem value="__none__person__">ND (yo mismo)</SelectItem>
              {people.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
          </>}
        </CardContent>
      </Card>

      <Card className="glass-card min-w-0">
        <CardHeader className="px-3 sm:px-6 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Registros</CardTitle>
            {mobile && <div role="group" aria-label="Vista de movimientos" className="flex gap-0.5 rounded-lg bg-muted/50 p-0.5">
              {(["simple", "extended"] as const).map((view) => (
                <Button key={view} type="button" size="sm" className="h-10 px-2.5"
                  variant={mobileView === view ? "secondary" : "ghost"} aria-pressed={mobileView === view}
                  onClick={() => { setMobileView(view); localStorage.setItem(MOBILE_VIEW_KEY, view); }}>
                  {view === "simple" ? "Simple" : "Extendida"}
                </Button>
              ))}
            </div>}
          </div>
          {mobile && !compact && <p className="text-xs text-muted-foreground">Desliza hacia los lados para ver todas las columnas.</p>}
        </CardHeader>
        <CardContent className="p-0">
          {compact ? (
            visible.length ? <ul className="divide-y divide-border/60">
              {visible.map((transaction, index) => (
                <li key={transaction.id} className="[content-visibility:auto] [contain-intrinsic-block-size:auto_76px]">
                  {visible[index - 1]?.tx_date !== transaction.tx_date && <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">{formatDate(transaction.tx_date)}</p>}
                  <button type="button" onClick={() => setViewing(transaction)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                    <span className="min-w-0 space-y-1.5">
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className={TYPE_TONE[transaction.tx_type]}>{TYPE_LABEL[transaction.tx_type]}</Badge>
                      </span>
                      <span className="block truncate text-sm">{transaction.description || "Sin descripción"}</span>
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums">
                      {Number(transaction.amount_pen) > 0 && <span className="block">{formatPEN(transaction.amount_pen)}</span>}
                      {Number(transaction.amount_usd) > 0 && <span className="block">{formatUSD(transaction.amount_usd)}</span>}
                      {!Number(transaction.amount_pen) && !Number(transaction.amount_usd) && "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul> : <p className="py-8 text-center text-sm text-muted-foreground">Sin movimientos con esos filtros.</p>
          ) : <Table className={mobile ? "min-w-max" : undefined}>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="w-[32px]" />}
                <TableHead>Fecha</TableHead>
                {mobile && <TableHead>Mes</TableHead>}
                <TableHead>Tipo</TableHead>
                {mobile ? <><TableHead>Medio de pago</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead></> : <TableHead>Cuenta</TableHead>}
                <TableHead>Categoría</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Soles</TableHead>
                <TableHead className="text-right">USD</TableHead>
                {mobile && <TableHead className="text-right">Importe recibido</TableHead>}
                <TableHead className="w-[120px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColumns} className="text-center py-8 text-muted-foreground">
                    Sin movimientos con esos filtros.
                  </TableCell>
                </TableRow>
              ) : visible.map((t) => {
                const cat = t.category_id ? categoriesById.get(t.category_id) : null;
                const accName = t.tx_type === "transfer"
                  ? `${accountsById.get(t.origin_account_id ?? "")?.name ?? "—"} → ${accountsById.get(t.destination_account_id ?? "")?.name ?? "—"}`
                  : accountsById.get(t.payment_account_id ?? "")?.name ?? "—";
                const person = t.person_id ? peopleById.get(t.person_id)?.name : "ND";
                return (
                  <TableRow
                    key={t.id}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      const src = visible.find((x) => x.id === dragId);
                      if (!src || src.tx_date !== t.tx_date) return;
                      e.preventDefault();
                      setOverId(t.id);
                    }}
                    onDragLeave={() => setOverId((o) => (o === t.id ? null : o))}
                    onDrop={(e) => { e.preventDefault(); handleDrop(t.id); }}
                    className={`hover:bg-muted/30 ${dragId === t.id ? "opacity-40" : ""} ${overId === t.id ? "ring-1 ring-primary/60" : ""}`}
                  >
                    {isAdmin && (
                      <TableCell className="w-[32px] p-1">
                        <div
                          draggable
                          onDragStart={() => setDragId(t.id)}
                          onDragEnd={() => { setDragId(null); setOverId(null); }}
                          title="Arrastra para reordenar (solo dentro del mismo día)"
                          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex items-center justify-center"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-xs">{formatDate(t.tx_date)}</TableCell>
                    {mobile && <TableCell className="text-xs">{monthName(Number(t.tx_date.slice(5, 7)))}</TableCell>}
                    <TableCell><Badge variant="outline" className={TYPE_TONE[t.tx_type]}>{TYPE_LABEL[t.tx_type]}</Badge></TableCell>
                    {mobile ? <>
                      <TableCell className="text-xs">{accountsById.get(t.payment_account_id ?? "")?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{accountsById.get(t.origin_account_id ?? "")?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{accountsById.get(t.destination_account_id ?? "")?.name ?? "—"}</TableCell>
                    </> : <TableCell className="text-xs max-w-[180px] truncate">{accName}</TableCell>}
                    <TableCell className="text-xs">{cat?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{person}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{t.description ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {Number(t.amount_pen) > 0 ? formatPEN(t.amount_pen) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {Number(t.amount_usd) > 0 ? formatUSD(t.amount_usd) : "—"}
                    </TableCell>
                    {mobile && <TableCell className="text-right text-xs">{receivedAmount(t)}</TableCell>}
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className={mobile ? "h-10 w-10" : "h-7 w-7"} aria-label="Ver detalle" onClick={() => setViewing(t)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button size="icon" variant="ghost" className={mobile ? "h-10 w-10" : "h-7 w-7"}
                              onClick={() => editMovement(t)} aria-label="Editar" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className={mobile ? "h-10 w-10" : "h-7 w-7"}
                              onClick={() => editMovement(t, true)} aria-label="Duplicar" title="Duplicar">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(t.id)} aria-label="Eliminar" title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>}
        </CardContent>
      </Card>

      <TransactionFormDialog
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setDuplicating(null); }}
        initial={editing}
        prefill={duplicating}
      />

      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="w-[calc(100%_-_2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-xl">
          <DialogHeader><DialogTitle>Detalle del movimiento</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <Row k="Fecha" v={formatDate(viewing.tx_date)} />
              <Row k="Tipo" v={viewing.tx_type === "expense" ? "Gasto" : viewing.tx_type === "income" ? "Ingreso" : "TI"} />
              {viewing.tx_type !== "transfer" && (
                <Row k="Medio de pago" v={accountsById.get(viewing.payment_account_id ?? "")?.name ?? "—"} />
              )}
              {viewing.tx_type === "transfer" && (
                <>
                  <Row k="Origen" v={accountsById.get(viewing.origin_account_id ?? "")?.name ?? "—"} />
                  <Row k="Destino" v={accountsById.get(viewing.destination_account_id ?? "")?.name ?? "—"} />
                </>
              )}
              <Row k="Categoría" v={viewing.category_id ? categoriesById.get(viewing.category_id)?.name ?? "—" : "—"} />
              <Row k="Referente a" v={viewing.person_id ? peopleById.get(viewing.person_id)?.name ?? "ND" : "ND"} />
              <Row k="Soles" v={Number(viewing.amount_pen) > 0 ? formatPEN(viewing.amount_pen) : "—"} />
              <Row k="Dólares" v={Number(viewing.amount_usd) > 0 ? formatUSD(viewing.amount_usd) : "—"} />
              {!!viewing.destination_amount && <Row k="Importe recibido" v={receivedAmount(viewing)} />}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Descripción completa</div>
                <div className="bg-muted/40 rounded-md p-3 whitespace-pre-wrap break-words">
                  {viewing.description || "—"}
                </div>
              </div>
              {compact && isAdmin && <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" onClick={() => editMovement(viewing)}>Editar</Button>
                <Button variant="outline" onClick={() => editMovement(viewing, true)}>Duplicar</Button>
                <Button variant="ghost" className="text-destructive" onClick={async () => {
                  if (await handleDelete(viewing.id)) setViewing(null);
                }}>Eliminar</Button>
              </div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-4 border-b border-border/40 pb-1.5">
    <span className="text-muted-foreground">{k}</span>
    <span className="font-medium text-right">{v}</span>
  </div>
);

export default Movimientos;
