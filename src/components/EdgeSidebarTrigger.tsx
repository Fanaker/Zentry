import { useLocation } from "react-router-dom";
import { navigationItems } from "./AppSidebar";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Edge-hover trigger: a thin invisible hot zone on the right edge of the sidebar
 * (or on the left edge of the screen when collapsed). A semi-transparent arrow
 * fades in only on hover. No floating button on top of the logo.
 */
export function EdgeSidebarTrigger() {
  const { state, toggleSidebar, isMobile, openMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const title = navigationItems.find(item => item.url === pathname)?.title ?? (pathname === "/configuracion" ? "Configuración" : "Zentry");
  const collapsed = state === "collapsed";

  if (isMobile) {
    return (
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/50 bg-background/95 px-4 py-2 backdrop-blur-md">
        <button type="button" aria-label="Abrir menú" aria-expanded={openMobile}
          onClick={() => setOpenMobile(!openMobile)}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border/50 bg-card">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold">{title}</span>
      </header>
    );
  }

  return (
    <button
      type="button"
      aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
      onClick={toggleSidebar}
      className={cn(
        "group fixed top-0 bottom-0 z-50 w-3 hidden md:flex items-center justify-center",
        "transition-all",
        collapsed ? "left-[3rem]" : "left-[16rem]"
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center h-10 w-6 rounded-r-md",
          "bg-primary/0 group-hover:bg-primary/40 backdrop-blur-sm",
          "border border-transparent group-hover:border-primary/30",
          "opacity-0 group-hover:opacity-100 transition-all duration-200",
          "-translate-x-1 group-hover:translate-x-0"
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-primary-foreground" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 text-primary-foreground" />
        )}
      </span>
    </button>
  );
}
