package com.fanaker.zentry;

import android.app.Activity;
import android.content.SharedPreferences;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.CancellationSignal;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Protects the existing app session with Android's device authentication. */
final class DeviceUnlock {
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_STRONG
        | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private static final long BACKGROUND_TIMEOUT_MS = 30_000;

    private final Activity activity;
    private final SharedPreferences settings;
    private final WebView web;
    private final LinearLayout cover;
    private final TextView message;
    private long backgroundAt;
    private boolean authenticating;
    private boolean locked;
    private boolean promptOnResume;

    DeviceUnlock(Activity activity, FrameLayout content, WebView web) {
        this.activity = activity;
        this.web = web;
        settings = activity.getSharedPreferences("zentry_device_lock", Activity.MODE_PRIVATE);
        cover = new LinearLayout(activity);
        cover.setOrientation(LinearLayout.VERTICAL);
        cover.setGravity(Gravity.CENTER);
        cover.setPadding(32, 24, 32, 24);
        cover.setBackgroundColor(0xff0b0e14);

        message = new TextView(activity);
        message.setText("Zentry está bloqueado");
        message.setTextSize(22);
        message.setTextColor(0xfff2f5fb);
        message.setGravity(Gravity.CENTER);
        cover.addView(message);

        Button unlock = new Button(activity);
        unlock.setText("Desbloquear");
        unlock.setOnClickListener(view -> requestUnlock());
        cover.addView(unlock);

        cover.setVisibility(View.GONE);
        content.addView(cover, new FrameLayout.LayoutParams(-1, -1));
        if (isEnabled()) {
            lock();
            promptOnResume = true;
        }
    }

    boolean isAvailable() {
        BiometricManager manager = activity.getSystemService(BiometricManager.class);
        return manager != null
            && manager.canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    boolean isEnabled() {
        return settings.getBoolean("enabled", false);
    }

    boolean isLocked() {
        return locked;
    }

    void configure(boolean enabled, Result result) {
        authenticate(enabled ? "Activar bloqueo de Zentry" : "Desactivar bloqueo de Zentry", error -> {
            if (error.isEmpty()) settings.edit().putBoolean("enabled", enabled).apply();
            result.complete(error);
        });
    }

    void onStop() {
        if (isEnabled() && !authenticating) backgroundAt = SystemClock.elapsedRealtime();
    }

    void onResume() {
        if (isEnabled() && backgroundAt > 0
                && SystemClock.elapsedRealtime() - backgroundAt >= BACKGROUND_TIMEOUT_MS) {
            lock();
            promptOnResume = true;
        }
        backgroundAt = 0;
        if (promptOnResume) {
            promptOnResume = false;
            cover.post(this::requestUnlock);
        }
    }

    private void lock() {
        locked = true;
        web.setVisibility(View.INVISIBLE);
        message.setText("Zentry está bloqueado");
        cover.setVisibility(View.VISIBLE);
    }

    private void requestUnlock() {
        if (!locked || authenticating) return;
        authenticate("Desbloquear Zentry", error -> {
            if (!error.isEmpty()) {
                message.setText(error);
                return;
            }
            locked = false;
            cover.setVisibility(View.GONE);
            web.setVisibility(View.VISIBLE);
        });
    }

    private void authenticate(String title, Result result) {
        if (authenticating) {
            result.complete("Ya hay una verificación en curso.");
            return;
        }
        if (!isAvailable()) {
            result.complete("Configura una huella o un PIN en los ajustes de Android.");
            return;
        }
        authenticating = true;
        BiometricPrompt prompt = new BiometricPrompt.Builder(activity)
            .setTitle(title)
            .setSubtitle("Usa tu huella o el bloqueo de tu teléfono")
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build();
        prompt.authenticate(new CancellationSignal(), activity.getMainExecutor(),
            new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult authentication) {
                    authenticating = false;
                    result.complete("");
                }

                @Override public void onAuthenticationError(int code, CharSequence text) {
                    authenticating = false;
                    result.complete(text.toString());
                }
            });
    }

    interface Result {
        void complete(String error);
    }
}
