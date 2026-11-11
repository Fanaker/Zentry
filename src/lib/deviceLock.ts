import { getConnection } from "@/lib/connection";

declare global {
  interface Window {
    zentryDeviceLockResult?: (error: string) => void;
  }
}

const emailKey = () => `zentry.lastEmail:${getConnection()?.url ?? ""}`;

export function readRememberedEmail(): string {
  try {
    return window.ZentryAndroid ? localStorage.getItem(emailKey()) ?? "" : "";
  } catch {
    return "";
  }
}

export function rememberEmail(email: string) {
  if (!window.ZentryAndroid || !email) return;
  try {
    localStorage.setItem(emailKey(), email);
  } catch {
    // Signing in still works when local storage is unavailable.
  }
}

export function configureDeviceLock(enabled: boolean): Promise<void> {
  const bridge = window.ZentryAndroid;
  if (!bridge?.configureDeviceLock) return Promise.reject(new Error("Actualiza el APK para usar el bloqueo del dispositivo."));
  if (window.zentryDeviceLockResult) return Promise.reject(new Error("Ya hay una verificación en curso."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish("La verificación tardó demasiado."), 120_000);
    function finish(error: string) {
      clearTimeout(timer);
      delete window.zentryDeviceLockResult;
      if (error) reject(new Error(error));
      else resolve();
    }
    window.zentryDeviceLockResult = finish;
    bridge.configureDeviceLock(enabled);
  });
}
