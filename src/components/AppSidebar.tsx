import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ArrowLeftRight, Wallet, Users, Target,
  CalendarCheck, Database, Settings, LogOut, CreditCard, Shield,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/zentry-logo.png";

export const navigationItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Por confirmar", url: "/por-confirmar", icon: CalendarCheck },
  { title: "Movimientos", url: "/movimientos", icon: ArrowLeftRight },
  { title: "Cuentas", url: "/cuentas", icon: Wallet },
  { title: "Préstamos", url: "/prestamos", icon: Users },
  { title: "Presupuesto", url: "/presupuesto", icon: Target },
  { title: "Cierre Mensual", url: "/cierre-mensual", icon: CalendarCheck },
  { title: "Tarjetas Crédito", url: "/tarjetas-credito", icon: CreditCard },
  { title: "Importar / Exportar", url: "/datos", icon: Database },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { signOut, isAdmin, isSuperAdmin, user, role } = useAuth();

  const isActive = (path: string) => pathname === path || (path !== "/" && pathname.startsWith(path));

  const displayName =
    (user?.user_metadata as any)?.display_name ||
    user?.email?.split("@")[0] ||
    "Usuario";
  const roleLabel =
    role === "super_admin" ? "Super Admin"
    : role === "admin" ? "Administrador"
    : role === "viewer" ? "Usuario"
    : "Propietario";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border backdrop-blur-xl bg-sidebar/85">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 px-2 py-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-lg bg-gradient-primary p-[2px] flex-shrink-0 shadow-glow">
            <div className="w-full h-full rounded-md bg-sidebar flex items-center justify-center overflow-hidden">
              <img src={logo} alt="Fanaker · Zentry" className="w-7 h-7 object-contain" width={28} height={28} />
            </div>
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-semibold text-sm gradient-text">Zentry Project</span>
              <span className="text-[10px] text-sidebar-foreground/60 truncate">by Fanaker</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={active ? "relative bg-gradient-primary-soft text-sidebar-primary-foreground before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[3px] before:rounded-r-full before:bg-gradient-primary before:shadow-glow" : ""}
                    >
                      <NavLink onClick={closeMobile} to={item.url} end={item.url === "/"}>
                        <item.icon className={`h-4 w-4 ${active ? "text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.7)]" : ""}`} />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/configuracion")} tooltip="Configuración">
                    <NavLink onClick={closeMobile} to="/configuracion">
                      <Settings className="h-4 w-4" />
                      <span>Configuración</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {false && (
          <SidebarGroup>
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")} tooltip="Admin">
                    <NavLink onClick={closeMobile} to="/admin">
                      <Shield className="h-4 w-4" />
                      <span>Admin</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-sm font-medium truncate">{displayName}</span>
                <span className="text-[10px] text-sidebar-foreground/60 truncate">{roleLabel}</span>
              </div>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Cerrar sesión">
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
