import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { format } from "date-fns";

type Allowed = {
  id: string;
  email: string;
  note: string | null;
  used: boolean;
  used_at: string | null;
  created_at: string;
};

type UserRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  created_at: string;
};

export default function Admin() {
  const { isSuperAdmin, user, loading } = useAuth();

  const [allowed, setAllowed] = useState<Allowed[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [toDelete, setToDelete] = useState<UserRow | null>(null);

  const load = async () => {
    setRefreshing(true);
    const [a, u] = await Promise.all([
      supabase.from("allowed_signups").select("*").order("created_at", { ascending: false }),
      supabase.rpc("admin_list_users"),
    ]);
    if (a.error) toast.error("Error cargando lista: " + a.error.message);
    else setAllowed((a.data ?? []) as Allowed[]);
    if (u.error) toast.error("Error cargando usuarios: " + u.error.message);
    else setUsers((u.data ?? []) as UserRow[]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Card className="p-6 max-w-md mx-auto mt-10">
        <h2 className="font-semibold mb-2">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Solo el super administrador puede acceder a esta sección.
        </p>
      </Card>
    );
  }

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast.error("Ingresa un correo válido");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("allowed_signups")
      .insert({ email: trimmed, note: note.trim() || null, created_by: user?.id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Correo autorizado");
    setEmail("");
    setNote("");
    load();
  };

  const removeAllowed = async (id: string) => {
    const { error } = await supabase.from("allowed_signups").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Eliminado");
      load();
    }
  };


  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.rpc("admin_delete_user", { _user_id: toDelete.user_id });
    if (error) toast.error(error.message);
    else {
      toast.success("Usuario eliminado");
      setToDelete(null);
      load();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Administración</h1>
          <p className="text-sm text-muted-foreground">
            Autoriza correos y gestiona usuarios de la plataforma.
          </p>
        </div>
      </div>

      {/* Whitelist form */}
      <Card className="p-5 glass-card">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Autorizar nuevo correo</h2>
        </div>
        <form onSubmit={addEmail} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              placeholder="persona@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input
              id="note"
              placeholder="Ej: hermana, contador, etc."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="w-full md:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Autorizar"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Allowed signups list */}
      <Card className="p-5 glass-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Correos autorizados</h2>
          </div>
          <span className="text-xs text-muted-foreground">{allowed.length} en total</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Agregado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allowed.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No hay correos autorizados aún.
                  </TableCell>
                </TableRow>
              )}
              {allowed.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.email}</TableCell>
                  <TableCell className="text-muted-foreground">{a.note ?? "—"}</TableCell>
                  <TableCell>
                    {a.used ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary">
                        Registrado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                        Pendiente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(a.created_at), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeAllowed(a.id)}
                      disabled={a.used}
                      title={a.used ? "Ya registrado: elimina el usuario en la otra tabla" : "Quitar autorización"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Users list */}
      <Card className="p-5 glass-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Usuarios registrados</h2>
          </div>
          {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell className="font-medium">{u.display_name ?? "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      u.role === "super_admin" ? "bg-gradient-primary text-primary-foreground" :
                      u.role === "admin" ? "bg-primary/15 text-primary" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {u.role === "super_admin" ? "Super Admin" : u.role === "admin" ? "Admin" : "Usuario"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(u.created_at), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setToDelete(u)}
                      disabled={u.user_id === user?.id}
                      title="Eliminar usuario y su data"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <b>{toDelete?.email}</b> y <b>toda su data</b> (cuentas, movimientos,
              presupuestos, cierres, etc.). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
