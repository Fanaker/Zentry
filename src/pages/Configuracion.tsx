import DeviceLockControl from "@/components/DeviceLockControl";
import SecurityTools from "@/components/SecurityTools";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccounts, useCategories, type Category } from "@/hooks/useFinanceData";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, RotateCcw, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const categoryTypes = [
  { type: "expense", label: "Gastos" },
  { type: "income", label: "Ingresos" },
  { type: "transfer", label: "Transferencias internas" },
] as const;
const sortCategories = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const searchText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();

async function hasCategoryMovements(id: string) {
  const { data, error } = await supabase.from("transactions").select("id").eq("category_id", id).limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

const Configuracion = () => {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();

  const [newAccount, setNewAccount] = useState({ name: "", account_type: "debit" as any, currency: "PEN" as any, counts_as_real_money: true });
  const [newCat, setNewCat] = useState({ name: "", tx_type: "expense" as any });
  const [editAcc, setEditAcc] = useState<null | { id: string; name: string; account_type: any; currency: any; original_name: string }>(null);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const savingCategoryRef = useRef(false);
  const originalCategory = categories.find(category => category.id === editCat?.id);
  const categoryUsage = useQuery({
    queryKey: ["category-usage", user?.id, editCat?.id],
    queryFn: () => hasCategoryMovements(editCat!.id),
    enabled: !!editCat && isAdmin,
    staleTime: 0,
    refetchInterval: false,
    retry: false,
  });
  const categoryTypeLocked = !!originalCategory?.system_code || categoryUsage.data !== false
    || categoryUsage.isFetching || categoryUsage.isError;

  const addAccount = async () => {
    if (!newAccount.name.trim()) return;
    const { error } = await supabase.from("accounts").insert(newAccount);
    if (error) toast.error(error.message);
    else { toast.success("Cuenta creada"); qc.invalidateQueries({ queryKey: ["accounts"] }); setNewAccount({ ...newAccount, name: "" }); }
  };

  const toggleRealMoney = async (id: string, value: boolean) => {
    const { error } = await supabase.from("accounts").update({ counts_as_real_money: value }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const toggleHidden = async (id: string, value: boolean) => {
    const { error } = await supabase.from("accounts").update({ hidden_in_accounts: value }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["accounts"] });
  };

  const toggleActive = async (id: string, value: boolean) => {
    const { error } = await supabase.from("accounts").update({ is_active: value }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(value ? "Cuenta reactivada" : "Cuenta marcada como anulada");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    }
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta.\n\nSugerencia: si solo cancelaste la tarjeta, márcala como Anulada en lugar de eliminarla, así conservas el historial.")) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Cuenta eliminada"); qc.invalidateQueries({ queryKey: ["accounts"] }); }
  };

  const saveEditAccount = async () => {
    if (!editAcc) return;
    const trimmed = editAcc.name.trim();
    if (!trimmed) { toast.error("El nombre no puede estar vacío"); return; }
    const { error } = await supabase
      .from("accounts")
      .update({ name: trimmed, account_type: editAcc.account_type, currency: editAcc.currency })
      .eq("id", editAcc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cuenta actualizada. Los movimientos asociados ya muestran el nuevo nombre automáticamente.");
    qc.invalidateQueries({ queryKey: ["accounts"] });
    setEditAcc(null);
  };

  const saveEditCategory = async () => {
    if (!editCat || !originalCategory || savingCategoryRef.current) return;
    const name = editCat.name.trim();
    if (!name) { toast.error("El nombre no puede estar vacío"); return; }
    savingCategoryRef.current = true;
    setSavingCategory(true);
    try {
      const changes: { name: string; tx_type?: Category["tx_type"] } = { name };
      if (editCat.tx_type !== originalCategory.tx_type) {
        if (originalCategory.system_code || await hasCategoryMovements(editCat.id)) {
          await categoryUsage.refetch();
          setEditCat({ ...editCat, tx_type: originalCategory.tx_type });
          toast.error("Esta categoría ya está en uso. Puedes cambiarle el nombre.");
          return;
        }
        changes.tx_type = editCat.tx_type;
      }
      const { data, error } = await supabase.from("categories").update(changes)
        .eq("id", editCat.id).eq("tx_type", originalCategory.tx_type).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("La categoría cambió. Recarga y vuelve a editarla.");
      toast.success("Categoría actualizada");
      void qc.invalidateQueries({ queryKey: ["categories"] });
      setEditCat(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "No se pudo guardar la categoría.");
    } finally {
      savingCategoryRef.current = false;
      setSavingCategory(false);
    }
  };

  const addCategory = async () => {
    if (!newCat.name.trim()) return;
    const { error } = await supabase.from("categories").insert(newCat);
    if (error) toast.error(error.message);
    else { toast.success("Categoría creada"); qc.invalidateQueries({ queryKey: ["categories"] }); setNewCat({ ...newCat, name: "" }); }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Categoría eliminada"); qc.invalidateQueries({ queryKey: ["categories"] }); }
  };

  const filteredCategories = useMemo(() => {
    const search = searchText(categorySearch);
    return categories.filter(category => searchText(category.name).includes(search))
      .sort((a, b) => sortCategories.compare(a.name, b.name));
  }, [categories, categorySearch]);

  async function reactivateCategory(id: string) {
    const { error } = await supabase.from("categories").update({ is_active: true }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Categoría reactivada");
      void qc.invalidateQueries({ queryKey: ["categories"] });
    }
  }

  function categoryRow(category: Category) {
    return <li key={category.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
      <span className="min-w-0 flex-1 break-words text-sm font-medium">{category.name}</span>
      <div className="flex shrink-0 items-center gap-1">
        {!category.is_active && <Button size="icon" variant="ghost"
          title="Reactivar" aria-label={`Reactivar ${category.name}`}
          onClick={() => reactivateCategory(category.id)}><RotateCcw className="h-4 w-4" /></Button>}
        <Button size="icon" variant="ghost" title="Editar"
          aria-label={`Editar ${category.name}`} onClick={() => setEditCat({ ...category })}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Eliminar" className="text-destructive hover:text-destructive"
          aria-label={`Eliminar ${category.name}`} onClick={() => deleteCategory(category.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </li>;
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Cuentas, categorías y permisos.</p>
      </div>

      <SecurityTools/>
      <DeviceLockControl/>
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Cuentas</TabsTrigger>
          <TabsTrigger value="categories">Categorías</TabsTrigger>

        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Nueva cuenta</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-[1fr,140px,120px,auto,auto] gap-2">
              <Input placeholder="Nombre" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} />
              <Select value={newAccount.account_type} onValueChange={(v) => setNewAccount({ ...newAccount, account_type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Débito</SelectItem>
                  <SelectItem value="credit">Crédito</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="dollars">Dólares</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newAccount.currency} onValueChange={(v) => setNewAccount({ ...newAccount, currency: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PEN">PEN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 px-2">
                <Switch checked={newAccount.counts_as_real_money} onCheckedChange={(v) => setNewAccount({ ...newAccount, counts_as_real_money: v })} />
                <span className="text-xs">Dinero real</span>
              </div>
              <Button onClick={addAccount}><Plus className="h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-2">
              {[...accounts]
                .sort((a, b) => Number(b.is_active) - Number(a.is_active))
                .map((a) => (
                <div
                  key={a.id}
                  className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 border-b border-border/40 last:border-0 ${
                    !a.is_active ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {a.name}
                        {!a.is_active && (
                          <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                            Anulada
                          </Badge>
                        )}
                        {a.hidden_in_accounts && (
                          <Badge variant="outline" className="text-[10px]">Oculta en Cuentas</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{a.account_type} · {a.currency}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                      <Switch checked={a.counts_as_real_money} onCheckedChange={(v) => toggleRealMoney(a.id, v)} />
                      <span className="text-xs">Dinero real</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch checked={!!a.hidden_in_accounts} onCheckedChange={(v) => toggleHidden(a.id, v)} />
                      <span className="text-xs">Ocultar en Cuentas</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch checked={a.is_active} onCheckedChange={(v) => toggleActive(a.id, v)} />
                      <span className="text-xs">{a.is_active ? "Activa" : "Anulada"}</span>
                    </label>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditAcc({ id: a.id, name: a.name, account_type: a.account_type, currency: a.currency, original_name: a.name })}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteAccount(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Nueva categoría</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <Input aria-label="Nombre de la categoría nueva" placeholder="Nombre" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
              <Select value={newCat.tx_type} onValueChange={(v) => setNewCat({ ...newCat, tx_type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="income">Ingreso</SelectItem>
                  <SelectItem value="transfer">TI</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addCategory}><Plus className="mr-2 h-4 w-4" /> Crear categoría</Button>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Organizar categorías</CardTitle>
              <div className="relative max-w-md">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Buscar categoría" placeholder="Buscar categoría…" className="pl-9"
                  value={categorySearch} onChange={event => setCategorySearch(event.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="expense">
                <TabsList aria-label="Tipo de categoría" className="h-auto w-full flex-wrap justify-start sm:w-auto">
                  {categoryTypes.map(({ type, label }) => <TabsTrigger key={type} value={type} className="whitespace-normal">{label}</TabsTrigger>)}
                </TabsList>
                {categoryTypes.map(({ type }) => {
                  const items = filteredCategories.filter(category => category.tx_type === type);
                  const active = items.filter(category => category.is_active);
                  const inactive = items.filter(category => !category.is_active);
                  return <TabsContent key={type} value={type} className="mt-4 space-y-4">
                    {active.length > 0
                      ? <ul className="divide-y divide-border rounded-lg border border-border">{active.map(categoryRow)}</ul>
                      : <p className="text-sm text-muted-foreground">No hay categorías activas{categorySearch.trim() ? " que coincidan" : ""}.</p>}
                    {inactive.length > 0 && <details className="rounded-lg border border-border">
                      <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">Inactivas ({inactive.length})</summary>
                      <ul className="divide-y divide-border border-t border-border">{inactive.map(categoryRow)}</ul>
                    </details>}
                  </TabsContent>;
                })}
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Edit account dialog */}
      <Dialog open={!!editAcc} onOpenChange={(o) => !o && setEditAcc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cuenta</DialogTitle>
          </DialogHeader>
          {editAcc && (
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={editAcc.name}
                  onChange={(e) => setEditAcc({ ...editAcc, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={editAcc.account_type} onValueChange={(v) => setEditAcc({ ...editAcc, account_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Débito</SelectItem>
                      <SelectItem value="credit">Crédito</SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="dollars">Dólares</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={editAcc.currency} onValueChange={(v) => setEditAcc({ ...editAcc, currency: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PEN">PEN</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
                Los movimientos se vinculan a la cuenta por ID, así que cualquier cambio de nombre se refleja automáticamente en todo el historial — no necesitas editar movimiento por movimiento.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditAcc(null)}>Cancelar</Button>
            <Button onClick={saveEditAccount}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit category dialog */}
      <Dialog open={!!editCat} onOpenChange={(o) => !o && !savingCategory && setEditCat(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar categoría</DialogTitle>
            <DialogDescription>El nuevo nombre se mostrará también en los movimientos vinculados.</DialogDescription>
          </DialogHeader>
          {editCat && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="edit-category-name">Nombre</Label>
                <Input
                  id="edit-category-name"
                  value={editCat.name}
                  onChange={(e) => setEditCat({ ...editCat, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select disabled={categoryTypeLocked || savingCategory} value={editCat.tx_type} onValueChange={(v) => setEditCat({ ...editCat, tx_type: v as Category["tx_type"] })}>
                  <SelectTrigger aria-label="Tipo de categoría"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto</SelectItem>
                    <SelectItem value="income">Ingreso</SelectItem>
                    <SelectItem value="transfer">TI</SelectItem>
                  </SelectContent>
                </Select>
                {categoryTypeLocked && <p className="mt-1 text-xs text-muted-foreground">
                  {originalCategory?.system_code ? "El tipo de esta categoría del sistema está protegido."
                    : categoryUsage.isFetching ? "Comprobando si tiene movimientos…"
                    : categoryUsage.isError ? "No se pudo comprobar el historial. Puedes cambiar el nombre."
                    : "Esta categoría tiene movimientos. Puedes cambiar el nombre."}
                </p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={savingCategory} onClick={() => setEditCat(null)}>Cancelar</Button>
            <Button disabled={savingCategory} onClick={saveEditCategory}>{savingCategory ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Configuracion;
