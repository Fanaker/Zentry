import { hasNativeVoice } from "@/lib/native";
import FinanceBoundary from "./FinanceBoundary";
import MfaGate from "./MfaGate";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { EdgeSidebarTrigger } from "./EdgeSidebarTrigger";
import QuickAddFab from "./QuickAddFab";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <MfaGate><FinanceBoundary><SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <EdgeSidebarTrigger />
          <main key={location.pathname} className={`flex-1 p-4 md:p-6 overflow-x-hidden animate-fade-in ${hasNativeVoice() ? "pb-28 md:pb-28" : ""}`}>
            <Outlet />
          </main>
        </div>
        <QuickAddFab />
      </div>
    </SidebarProvider></FinanceBoundary></MfaGate>
  );
}
