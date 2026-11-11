# Validación — Zentry 2.2.0

La documentación de entrega original registró **38 pruebas de interfaz/lógica y 25 comprobaciones de base de datos** durante la preparación de la versión 2.2.0. Esas cifras proceden del proceso de preparación original; **no implican que esta nueva empaquetación para GitHub haya vuelto a ejecutar las pruebas**.

## Comprobaciones reproducibles

```bash
npm ci
npm run typecheck
npm test
npm run test:db
npm run build
```

O, de manera unificada:

```bash
npm run verify
```

Salida web: `dist/`. Para preparar Android: `npm run android:sync` con JDK 17, Android SDK 35 e identificador `com.fanaker.zentry`.

Esta distribución para GitHub contiene **código fuente**, no incluye `dist/`, un ZIP de Cloudflare ni una APK firmada. El despliegue final y las pruebas con una sesión real requieren el proyecto Supabase del entorno correspondiente.
