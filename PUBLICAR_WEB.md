# Publicación de Zentry 2.2.0 (web y Android)

**Este repositorio es código fuente.** El ZIP preparado para GitHub no es un ZIP de despliegue para Cloudflare Pages ni una APK Android.

## Actualizar la web en Cloudflare Pages (carga manual)

1. Con Node.js instalado, abre la carpeta raíz de Zentry y ejecuta `npm ci` y luego `npm run build`.
2. La carpeta `dist/` contiene los archivos estáticos generados. **Comprime el contenido de `dist/`**, de modo que el archivo `index.html` esté en la raíz del ZIP de despliegue (no dentro de una carpeta `dist`).
3. En Cloudflare abre **Workers & Pages**, selecciona tu proyecto de Zentry y ve a **Deployments**.
4. Crea un nuevo despliegue de **Production** y carga el ZIP construido para la web, siguiendo las opciones mostradas por Cloudflare.
5. Tras el despliegue, abre tu dominio habitual y verifica la versión; si el navegador conserva la versión anterior, usa `Ctrl+F5`.

El procedimiento anterior **no modifica la base de datos** y supone que la aplicación ya dispone de conexión correcta con Supabase. **No vuelvas a ejecutar `database/INSTALL_NEW.sql` sobre una base existente**.

Si Cloudflare Pages está conectado a GitHub para desplegar automáticamente, revisa primero su configuración de rama, comando de compilación (`npm run build`) y carpeta de salida (`dist`). En ese caso, subir a `main` podría publicar cambios sin una carga manual.

Documentación de Cloudflare: https://developers.cloudflare.com/pages/get-started/direct-upload/

## Android

- Ejecuta `npm run android:sync` para generar y copiar la versión web al proyecto Android.
- Compila con **JDK 17** y **Android SDK 35** desde `android/` (`gradlew.bat assembleDebug` para pruebas en Windows).
- Para actualizar una instalación existente con una APK de distribución, necesitas **la misma clave de firma** con la que se firmó la versión previa. Una compilación de depuración no es un reemplazo de una APK previamente firmada para distribución.
- No subas tu keystore ni los secretos de firma a GitHub.

**Nota:** La documentación de entrega original se refería a archivos separados de distribución web/APK. Esos binarios no están incluidos en este ZIP de código para GitHub.
