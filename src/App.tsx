import {lazy,Suspense} from "react";
import { getConnection } from "@/lib/connection";
import ConnectionSetup from "./pages/ConnectionSetup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound.tsx";

const Capturas=lazy(()=>import("./pages/Capturas"));
const Dashboard=lazy(()=>import("./pages/Dashboard"));
const Movimientos=lazy(()=>import("./pages/Movimientos"));
const Cuentas=lazy(()=>import("./pages/Cuentas"));
const Prestamos=lazy(()=>import("./pages/Prestamos"));
const Presupuesto=lazy(()=>import("./pages/Presupuesto"));
const CierreMensual=lazy(()=>import("./pages/CierreMensual"));
const TarjetasCredito=lazy(()=>import("./pages/TarjetasCredito"));
const Datos=lazy(()=>import("./pages/Datos"));
const Configuracion=lazy(()=>import("./pages/Configuracion"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true } },
});

const App = () => !getConnection() ? <ConnectionSetup/> : (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner richColors theme="dark" position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<p role="status" className="p-6 text-muted-foreground">Cargando sección…</p>}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/por-confirmar" element={<Capturas />} />
              <Route path="/movimientos" element={<Movimientos />} />
              <Route path="/cuentas" element={<Cuentas />} />
              <Route path="/prestamos" element={<Prestamos />} />
              <Route path="/presupuesto" element={<Presupuesto />} />
              <Route path="/cierre-mensual" element={<CierreMensual />} />
              <Route path="/tarjetas-credito" element={<TarjetasCredito />} />
              <Route path="/datos" element={<Datos />} />
              <Route path="/configuracion" element={<Configuracion />} />

            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
