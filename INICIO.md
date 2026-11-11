# Zentry 2.2.0 — Inicio rápido

Esta carpeta contiene el **código fuente para GitHub**, no una APK ni el ZIP compilado para Cloudflare. Para explicar el proyecto a reclutadores, consulta [README.md](README.md) y su [versión en español](docs/README_ES.md).

## Trabajar localmente

1. Instala Node.js compatible (recomendado 22.12+) y ejecuta `npm ci`.
2. Configura la URL y **clave pública** de Supabase con `.env.example` o la pantalla de conexión.
3. Ejecuta `npm run dev` para desarrollo o `npm run verify` para comprobaciones.

## Base de datos

**Instalación nueva en un proyecto vacío:** `database/INSTALL_NEW.sql`, seguido de `database/05_provision_owner.sql` con el UUID correcto del usuario creado en Supabase Authentication.

**Instalación existente:** no ejecutes el instalador inicial ni sobrescribas la base en producción. Revisa las migraciones SQL aplicables. El script de alias `database/upgrade-2.1.2-aliases.sql` solo aplica a proyectos que todavía no lo tengan instalado.

## Distribución

- Web: `npm run build` → `dist/` (consulta [PUBLICAR_WEB.md](PUBLICAR_WEB.md)).
- Android: `npm run android:sync` y compila con JDK 17 + SDK 35. Para actualizar una APK ya instalada se necesita la firma original.
- GitHub: [docs/ACTUALIZAR_GITHUB.md](docs/ACTUALIZAR_GITHUB.md).

Los respaldos financieros y las credenciales privadas nunca deben incluirse en el repositorio. Para restaurar un respaldo completo, sigue el flujo de la propia aplicación y utiliza un espacio de destino compatible y vacío.
