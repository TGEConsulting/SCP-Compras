# Guía del piloto — Sistema de Compras La Quinta

**Objetivo:** probar el flujo real con poca gente y compras reales (sin pagos reales) durante 1 o 2 semanas, y juntar ajustes.
**Ambiente:** staging (datos de prueba). Nada de lo que se capture afecta producción.

## Quién participa
Un solicitante, un jefe de área, Compras, Almacén, Finanzas y **un proveedor amigable**. El administrador los pre-registra en *Administración → Usuarios* con el **mismo correo** con el que iniciarán sesión.

## Manual rápido por rol
**Solicitante** — *Solicitudes → Nueva solicitud*: título, motivo, productos y cantidades → «Enviar a mi jefe de área». Puede ver el estatus y el historial.
**Jefe de área** — en *Solicitudes* abre la enviada → «Tomar en revisión» → Aprobar, Rechazar o Devolver (rechazar y devolver piden motivo).
**Compras** — *Solicitudes aprobadas → Generar OC*: elige proveedor y precios → «Enviar al proveedor». Puede **cancelar** una OC (con motivo) mientras no tenga recepciones ni factura, e **imprimir / guardar PDF**. El tablero *Seguimiento* muestra qué está detenido.
**Proveedor** — *Mis órdenes*: confirma con fecha compromiso (y guía), y **carga la factura (PDF + XML)** citando la orden. Ve si está conciliada, con diferencia o bloqueada, y por qué.
**Almacén / Calidad** — *Recepción → orden*: el sistema muestra el estatus de la factura. Si no hay factura aparece: *«La factura aún no ha sido cargada por el proveedor. La recepción quedará pendiente de conciliación y el pago permanecerá bloqueado.»* Se guarda igual como pendiente. Captura cantidades recibida / aceptada / rechazada, lote, caducidad y temperatura cuando aplique; lo rechazado exige motivo y evidencia.
**Finanzas** — *Pagos*: solo aparecen facturas conciliadas con recepción aceptada. «Autorizar pago» y luego «Registrar pago» con referencia y fecha.
**Administrador** — *Administración*: usuarios y roles, jefe de cada área, proveedores, productos (cadena fría) y parámetros (RFC, tolerancias, plazos).

## Reglas que verán en pantalla
- El pago **nunca** se libera sin factura conciliada contra la orden y la recepción aceptada.
- Se bloquea (sin excepción): facturar más de lo aceptado, facturar lo rechazado, conceptos fuera de la orden, RFC receptor o proveedor distintos, factura duplicada.
- Se autoriza con motivo: diferencia de precio fuera de tolerancia, unidad o IVA distintos.
- No se aceptan notas de crédito, complementos de pago ni facturas con retenciones (por ahora).

## Pruebas de aceptación (marcar ✔ / ✘ y anotar comentarios)
| # | Escenario | Resultado esperado | ✔/✘ |
|---|-----------|--------------------|-----|
| 1 | Solicitante crea y envía una solicitud | Aparece para el jefe de su área | |
| 2 | Jefe devuelve una solicitud con motivo | El solicitante la ve «Devuelta» con el motivo y puede corregirla | |
| 3 | Jefe aprueba; Compras genera y envía la OC | El proveedor recibe correo y la ve en su portal | |
| 4 | Proveedor confirma con fecha compromiso | Estatus «Confirmada» | |
| 5 | Almacén recibe **sin** factura | Mensaje exacto de arriba; recepción «Pendiente de factura» | |
| 6 | Proveedor carga la factura correcta | Se concilia sola; «Lista para pago» | |
| 7 | Finanzas autoriza y registra el pago | Factura «Pagada» | |
| 8 | Recepción con producto rechazado; proveedor factura todo | Factura **bloqueada** con el motivo; no aparece en Pagos | |
| 9 | Proveedor carga la misma factura dos veces | Se rechaza por duplicada | |
| 10 | Factura con precio distinto al de la OC | «Con diferencia»; Compras/Finanzas autorizan con motivo | |
| 11 | Compras cancela una OC sin recepciones | Cancelada; la solicitud vuelve a «Aprobada» | |
| 12 | Un proveedor intenta ver una orden de otro (cambiando la dirección) | «No encontrado» | |
| 13 | Revisar *Seguimiento* | Coincide con lo que está pendiente | |

## Qué anotar durante el piloto
Pantallas confusas, pasos que sobran o faltan, datos que no tienen dónde capturarse, mensajes poco claros y cualquier factura real que el sistema rechace sin que debiera (guarda el XML para revisarlo).
