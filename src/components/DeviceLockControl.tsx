import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { configureDeviceLock } from "@/lib/deviceLock";

export default function DeviceLockControl() {
  const bridge = window.ZentryAndroid;
  const [enabled, setEnabled] = useState(() => bridge?.isDeviceLockEnabled?.() ?? false);
  const [busy, setBusy] = useState(false);
  if (!bridge?.configureDeviceLock) return null;

  const available = bridge.canUseDeviceLock?.() ?? false;
  async function toggleLock() {
    setBusy(true);
    try {
      await configureDeviceLock(!enabled);
      setEnabled(!enabled);
      toast.success(enabled ? "Bloqueo desactivado" : "Bloqueo activado");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card p-5 space-y-3">
      <h2 className="flex items-center gap-2 font-semibold"><Fingerprint className="h-5 w-5 text-primary" /> Bloqueo del dispositivo</h2>
      <p className="text-sm text-muted-foreground">Desbloquea tu sesión de Zentry con la huella o el PIN de tu teléfono.</p>
      {!available && <p className="text-sm text-muted-foreground">Configura una huella o un PIN en los ajustes de Android.</p>}
      <Button variant="outline" disabled={busy || !available} onClick={toggleLock}>
        {enabled ? "Desactivar huella o PIN" : "Activar huella o PIN"}
      </Button>
    </section>
  );
}
