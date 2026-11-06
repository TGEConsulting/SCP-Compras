---
name: proceso-compras-lq
description: Flujo end-to-end de compras de Productos Lácteos La Quinta (solicitud → aprobación → OC → proveedor → recepción → factura → conciliación → pago). Úsalo al tocar cualquier estado, transición o notificación del proceso.
---

# Proceso de compras La Quinta

## Instrucciones
Toda transición de estatus vive en una Server Action (`src/server/actions/*`), dentro de una transacción, con auditoría y notificación (outbox). Nunca cambies un estatus desde la UI ni desde una consulta de lectura.

## Flujo y dueños
| # | Paso | Rol que actúa | Estatus resultante | Acción |
|---|------|---------------|--------------------|--------|
| 1 | Crear solicitud | Solicitante | BORRADOR → ENVIADA | `saveRequest` |
| 2 | Aprobar / rechazar / devolver | Jefe **del área** de la solicitud | EN_REVISION → APROBADA / RECHAZADA / DEVUELTA | `startReview`, `decideRequest` |
| 3 | Seleccionar proveedor y generar OC | Compras | Solicitud OC_GENERADA; OC `OC_GENERADA` | `createOrder` |
| 4 | Enviar OC (correo + portal) | Compras | `ENVIADA_PROVEEDOR` | `sendOrder` |
| 5 | Confirmar, fecha compromiso, guía | Proveedor | `CONFIRMADA` → `EN_TRANSITO` | `confirmOrder`, `markInTransit` |
| 6 | Registrar recepción + inspección | Almacén / Calidad | `RECIBIDA_PARCIAL` / `RECIBIDA_TOTAL` | `registerReceipt` |
| 7 | Consulta de factura al recibir | Sistema | Recepción `PENDIENTE_FACTURA` o `COMPLETADA` | `getInvoiceIndicator` |
| 8 | Cargar factura PDF + XML | Proveedor | Factura `CARGADA` | `uploadInvoice` |
| 9 | Conciliar OC ↔ recepción ↔ factura | Sistema | `LISTA_PARA_PAGO` / `CON_DIFERENCIA` / `BLOQUEADA` | `runReconciliation` |
| 10 | Autorizar diferencias o rechazar factura | Compras / Finanzas | re-evaluación | `authorizeDifference`, `rejectInvoice` |
| 11 | Autorizar pago y registrar comprobante | Finanzas | `PAGADA` | `authorizePayment`, `registerPayment` |

## Reglas de negocio
- Una solicitud solo genera **una** OC; la OC hereda cantidades y unidades de la solicitud aprobada (el cliente solo aporta precios).
- Solo proveedores `AUTORIZADO` con documentación vigente (`documents_valid_until`) pueden recibir OC o facturar.
- Nadie aprueba su propia solicitud.
- Rechazados por Calidad no consumen la cantidad ordenada: el proveedor debe reponerlos.
- La recepción puede registrarse sin factura (→ `PENDIENTE_FACTURA`); el **pago** nunca.
- Una factura vigente por (proveedor, OC). Una factura rechazada libera el cupo.

## Validaciones
Zod en `src/lib/validators.ts` (mismas reglas en cliente y servidor). Reglas de dominio en servidor.

## Ejemplo
Solicitud de 100 kg → aprobada → OC a $50/kg → proveedor confirma → se reciben 100 kg (80 aceptados / 20 rechazados con fotos) → factura por 100 kg → **BLOQUEADA** (`CANTIDAD_RECHAZADA_FACTURADA`) → Compras la rechaza → proveedor carga factura por 80 kg → **LISTA_PARA_PAGO**.

## Criterios de aceptación
- [ ] Ninguna transición es posible fuera de la tabla de arriba (se verifica el estatus actual con `FOR UPDATE`).
- [ ] Cada transición crea una fila en `audit_logs` y, si aplica, una notificación.
- [ ] Doble clic / dos usuarios simultáneos no duplican OC, recepciones, facturas ni pagos.
