# Zentry 2.2.0 — Gestor de finanzas personales

**[README principal en inglés](../README.md)** · [Historial de cambios](../CHANGELOG.md)

Zentry es una aplicación de gestión financiera personal desarrollada con **React, TypeScript, Supabase y PostgreSQL**, disponible como web adaptable y aplicación Android. Ambas interfaces utilizan el mismo proyecto de base de datos.

## Funcionalidades

- **Dashboard:** ingresos, gastos, indicadores financieros y gráficos.
- **Movimientos:** ingresos, gastos y transferencias internas, con categorías, cuentas y personas relacionadas.
- **Cuentas y monedas:** control de cuentas y registros en PEN y USD.
- **Préstamos y deudas:** registro, seguimiento, cancelación e informes PDF.
- **Presupuesto y cierre mensual:** planificación, seguimiento y cierres financieros.
- **Tarjetas de crédito:** seguimiento por ciclos de facturación; las compras en cuotas son una mejora pendiente.
- **Datos:** importación/exportación Excel y respaldos completos para migración.
- **Captura móvil:** dictado mediante Gboard, revisión de borradores antes de confirmar y alias personalizados.
- **Seguridad:** Supabase Auth, políticas RLS por propietario (`owner_id`), aprovisionamiento explícito y soporte para MFA opcional.

## Arquitectura y tecnologías

Frontend con **React 18 + TypeScript + Vite**, Tailwind CSS, componentes Radix UI y gráficos Recharts. Backend administrado con **Supabase Authentication + PostgreSQL**, reglas RLS y funciones SQL. El proyecto Android usa **Java y WebView** para integrar la compilación web con funciones específicas del teléfono. Las pruebas utilizan **Vitest, Testing Library y PGlite**.

El dictado no depende de un servicio de reconocimiento de voz propietario: se realiza con **Gboard**, y el usuario revisa cada operación antes de registrarla.

## Ejecución local

Necesitas Node.js compatible con Vite 8 (recomendado 22.12+), npm y, para persistencia, un proyecto Supabase propio.

```bash
npm ci
npm run dev
```

En la pantalla inicial puedes ingresar la URL de Supabase y la **clave pública** publishable, o crear un archivo local `.env` copiando `.env.example`. El archivo `.env` y las credenciales privadas **no deben publicarse**.

Para una **base de datos completamente nueva**, revisa `database/INSTALL_NEW.sql` y `database/05_provision_owner.sql`. No ejecutes el instalador inicial sobre una base de datos en uso. Para verificar el código ejecuta `npm run verify`.

En Android, `npm run android:sync` genera la versión web y la copia al proyecto nativo. Para compilar necesitas JDK 17 y Android SDK 35. Las actualizaciones de una aplicación ya instalada requieren la misma firma que la versión anterior.

## Uso del repositorio

Este repositorio presenta el **código fuente**, las pruebas y los scripts SQL. No contiene datos personales, contraseñas, una APK de producción ni credenciales privadas. No está vinculado a un acceso público a los datos del propietario. El código de la aplicación se presenta para evaluación de portafolio sin licencia de código abierto explícita.

Para publicar la web consulta [PUBLICAR_WEB.md](../PUBLICAR_WEB.md). Si estás reemplazando el contenido anterior del repositorio GitHub, consulta [ACTUALIZAR_GITHUB.md](ACTUALIZAR_GITHUB.md).
