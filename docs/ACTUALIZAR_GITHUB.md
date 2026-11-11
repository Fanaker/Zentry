# Cómo actualizar el GitHub actual de Zentry (Windows)

**Objetivo:** conservar `https://github.com/Fanaker/Zentry` y su historial, pero reemplazar el contenido de Lovable por el código 2.2.0.

## Método recomendado: GitHub Desktop

1. Instala **GitHub Desktop**, inicia sesión y abre **File → Clone repository**.
2. Selecciona `Fanaker/Zentry` y clónalo en una carpeta local (por ejemplo, `Documentos\GitHub\Zentry`).
3. Descomprime el **ZIP preparado para GitHub** en una carpeta temporal distinta.
4. Abre la carpeta clonada de `Zentry` en el explorador de Windows. Borra los **archivos y carpetas de proyecto antiguos**, pero **NO** borres la carpeta oculta **`.git`**: es la que conserva la conexión y el historial del repositorio. No borres archivos fuera de esa carpeta.
5. Copia **el contenido descomprimido** del nuevo ZIP (incluidas `.gitignore`, `.env.example`, `README.md`, `src`, `android`, `database`, etc.) **directamente a la raíz** del repositorio clonado. No anides una nueva carpeta `Zentry`.
6. Regresa a GitHub Desktop y revisa los cambios: deben aparecer archivos nuevos, modificados y eliminados. Comprueba que **no** se esté agregando ningún `.env`, contraseña, APK privado ni dato real.
7. En **Summary** escribe `Update Zentry to v2.2.0` y pulsa **Commit to main**.
8. Pulsa **Push origin**. Abre `https://github.com/Fanaker/Zentry` para verificar que se ve el nuevo README y las carpetas `src`, `android` y `database`.

**Nunca subas el archivo `.zip` sin extraer como sustituto del repositorio:** GitHub no lo descomprime automáticamente. Tampoco uses `Upload files` en la web de GitHub si necesitas eliminar archivos obsoletos; GitHub Desktop es más fiable para una sustitución completa.

### Alternativa con Git (terminal)

Clona el repositorio y, **dentro de esa copia** (verifica antes la ubicación), elimina los archivos rastreados antiguos con `git rm -r .`, copia el contenido extraído del ZIP a esa carpeta sin borrar `.git`, y ejecuta:

```bash
git add -A
git status
git commit -m "Update Zentry to v2.2.0"
git push origin main
```

## Precaución con el despliegue

La subida a GitHub **no instala la APK** ni actualiza por sí sola tu web alojada con carga manual en Cloudflare. **Si** Cloudflare Pages está conectado a este repositorio para despliegue automático, un push a `main` podría activar una compilación y publicación; revisa primero esa integración. Si Lovable sigue sincronizado con GitHub, desconecta esa integración para evitar cambios automáticos no deseados.

Para desplegar en Cloudflare desde el código fuente, sigue [PUBLICAR_WEB.md](../PUBLICAR_WEB.md).
