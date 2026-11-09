# Revisión de seguridad — 9 nov 2026

Alcance: autenticación y roles, aislamiento por proveedor, archivos (Vercel Blob), cron, Server Actions, cabeceras y base de datos.
Método: lectura del código crítico + pruebas E2E contra el Preview (staging). Sin pruebas de intrusión externas.

## Lo que ya estaba bien
- **Autorización 100 % en servidor**: Clerk solo identifica; roles y permisos viven en la BD. Se revalidan en cada página y cada acción.
- **Aislamiento por proveedor en la consulta** (`WHERE supplier_id`), no en la interfaz. El proveedor no puede ver órdenes, facturas ni archivos de otro.
- **Archivos privados**: Blob en modo privado, ruta aleatoria, validación por firma real del archivo, descarga con URL firmada (HMAC) de 5 min ligada al usuario y autorización por objeto.
- **XML sin entidades externas** (XXE desactivado) y tamaño limitado.
- **Bitácora inmutable** por trigger de BD; duplicados bloqueados por índices únicos; una sola transacción con bloqueo de fila para recepciones y facturas.
- **Errores genéricos** al usuario; detalle solo en logs. Llaves sensibles solo en variables de entorno (sensibles en Vercel).

## Hallazgos y estado
| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | Media-Alta | Un XML subido por un proveedor se podía abrir **en línea desde el origen de la app**. Un XML con XHTML/XSLT puede ejecutar script. | **Corregido**: el XML se descarga siempre como adjunto y con `Content-Security-Policy: sandbox`. Verificado en E2E. (El PDF sigue en línea: `sandbox` bloquea el visor de Chrome.) |
| 2 | Baja-Media | El enlace del primer inicio de sesión (usuario ↔ cuenta de Clerk) no era atómico. | **Corregido**: solo enlaza si `auth_id` sigue libre. |
| 3 | Baja | Falta HSTS. | **Corregido** (`Strict-Transport-Security`). |
| 4 | Baja | El secreto del cron se comparaba con `===` (no en tiempo constante). | **Corregido** (`timingSafeEqual`). |
| 5 | Baja | Un administrador podía mezclar el rol Proveedor con roles internos, o ligar un usuario interno a un proveedor. | **Corregido** y con pruebas. |

## Pendiente (recomendado antes de producción)
1. **Repositorio privado** (hoy es público). No contiene secretos, pero sí la lógica del negocio.
2. **Rotar la llave de Clerk** que se compartió en el chat y usar llaves de producción distintas.
3. **MFA obligatorio** en Clerk para Finanzas y Administración (Clerk → User & Authentication → Multi-factor).
4. **Retención de historial de Neon**: hoy 6 horas. Subir en producción (≥ 7 días) para poder restaurar a un punto en el tiempo, y proteger la rama de producción.
5. **Límite de peticiones** (Vercel Firewall) en cargas de factura y en inicio de sesión.
6. **CSP completa** (`Content-Security-Policy` para páginas): requiere afinar con Clerk; se hace con modo «solo reporte» primero.
7. **Separación de funciones en pagos** (quien autoriza ≠ quien registra): decisión #8 de `docs/ARQUITECTURA.md`.
8. **RLS en Neon** como segunda barrera del aislamiento por proveedor (iteración 3).
9. Decidir si Almacén y Calidad deben ver **montos** en el tablero de Seguimiento (hoy ven lo mismo que en Facturas).
