import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mic, PenLine, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { hasNativeVoice } from "@/lib/native";
import TransactionFormDialog from "@/components/TransactionFormDialog";

const iconButtonClass = "flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-primary shadow-xl transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

export default function QuickAddFab() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const nativeVoice = hasNativeVoice();

  if (!isAdmin || pathname.startsWith("/auth")) return null;

  const openManual = () => {
    setExpanded(false);
    setOpen(true);
  };

  return (
    <>
      {expanded && (
        <button type="button" tabIndex={-1} aria-label="Cerrar acciones rápidas"
          className="fixed inset-0 z-40 bg-black/30" onClick={() => setExpanded(false)} />
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3 md:bottom-8 md:right-8"
        onKeyDown={event => { if (event.key === "Escape") setExpanded(false); }}>
        {expanded && (
          <div id="quick-add-options" role="group" aria-label="Registrar movimiento"
            className="flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-2">
            <button type="button" aria-label="Escribir" onClick={openManual} className={iconButtonClass}>
              <PenLine className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Dictar" onClick={() => {
              setExpanded(false);
              navigate("/por-confirmar", { state: { voiceRequest: crypto.randomUUID() } });
            }} className={iconButtonClass}>
              <Mic className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <button type="button" aria-label={expanded ? "Cerrar acciones rápidas" : "Agregar movimiento rápido"}
          aria-expanded={nativeVoice ? expanded : undefined}
          aria-controls={expanded ? "quick-add-options" : undefined}
          onClick={nativeVoice ? () => setExpanded(value => !value) : openManual}
          className="btn-shimmer flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-xl ring-1 ring-primary/40 transition-transform active:scale-95">
          <Plus className={`h-6 w-6 transition-transform ${expanded ? "rotate-45" : ""}`} aria-hidden="true" />
        </button>
      </div>
      <TransactionFormDialog open={open} onClose={() => setOpen(false)} initial={null} />
    </>
  );
}
