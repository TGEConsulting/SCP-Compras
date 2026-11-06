# Plan de siguientes iteraciones

## Hecho en el MVP (iteración 1)
Login (Clerk) + portal de proveedores · solicitud, aprobación, OC y envío · confirmación y carga de factura (PDF+XML con lectura de CFDI) · recepción con calidad y consulta de factura · conciliación de tres vías · bloqueo de pago · pagos · tablero por rol · auditoría inmutable · notificaciones por correo (outbox) · recordatorios/escalamiento por cron · esquema de 26 tablas con migraciones · 9 pruebas de la conciliación.

No incluido aún (deliberado): pantallas de administración (usuarios, proveedores, catálogos, parámetros), PDF de la OC, reportes/indicadores, edición de OC, cancelaciones.

## Iteración 2 — Administración y PDF (2–3 semanas)
- Pantallas admin: usuarios y roles, proveedores (documentos de homologación con vigencias, cuentas bancarias cifradas), productos/categorías/unidades, centros de costo, parámetros (`system_settings`).
- PDF de la OC (React-PDF o HTML imprimible) y adjunto en el correo.
- Edición/cancelación de OC con motivo y reenvío; cancelación de recepciones.
- Pruebas de integración con una rama de Neon efímera en CI (GitHub Actions) y pruebas E2E (Playwright) del flujo completo.
- RLS en Postgres para tablas de proveedor como defensa adicional.

## Iteración 3 — Reportes y operación (2 semanas)
- Tablero de indicadores: ciclo solicitud→OC, cumplimiento de fecha compromiso, % rechazos por proveedor/producto, antigüedad de facturas pendientes, facturas bloqueadas, cuentas por pagar.
- Exportación a Excel/CSV; búsqueda global.
- Calendario de días festivos para el escalamiento; reglas de escalamiento por monto.
- Alertas de vigencia de documentos de proveedores.

## Iteración 4 — Fiscal e integraciones (según prioridad)
- Validación de CFDI ante el SAT mediante PAC (Facturama/SW/Pacífico): estatus vigente/cancelado.
- Complementos de pago y notas de crédito; múltiples facturas por OC.
- Slack/Teams para alertas operativas; Google Drive/Notion para políticas y manuales (solo lectura).
- Evaluación de integración con ERP/contabilidad (SAP Business One) — solo si se solicita.

## Deuda técnica / riesgos conocidos
- Los enlaces firmados de archivos requieren render en servidor (no cachear páginas con `SignedLink`).
- Búsqueda con `ILIKE` (suficiente al volumen inicial; añadir `pg_trgm` si crece).
- Sin límite de tasa (rate limiting) en cargas; considerar Vercel Firewall / Upstash.
- Las fotos se suben antes de la transacción; si el proceso muere entre medias pueden quedar blobs huérfanos (job de limpieza pendiente).
