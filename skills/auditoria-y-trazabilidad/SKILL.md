---
name: auditoria-y-trazabilidad
description: Registro de auditoría inmutable de acciones críticas (quién, qué, cuándo, antes/después, motivo, origen). Úsalo al agregar o modificar cualquier acción que cambie datos.
---

# Auditoría y trazabilidad

## Instrucciones
Toda Server Action que cambie estado llama `audit(tx, session, {...})` **dentro de la misma transacción** (`src/lib/audit.ts`). Si la transacción se revierte, la auditoría también; si la auditoría falla, el cambio no se confirma.

## Campos (`audit_logs`)
usuario (`user_id`, `user_name`) · rol(es) · `table_name` · `record_id` · `action` · `old_data` · `new_data` · `at` · `comment` (motivo) · `origin` (`web|cron|seed|sistema`) · `ip`.

## Acciones que deben auditarse
CREAR_SOLICITUD, APROBAR/RECHAZAR/DEVOLVER_SOLICITUD, CREAR_OC, ENVIAR_PROVEEDOR, CONFIRMAR_PROVEEDOR, EN_TRANSITO, RECIBIR_MERCANCIA, RECHAZAR_PRODUCTO, CARGAR_FACTURA, FACTURA_DUPLICADA_BLOQUEADA, CONCILIAR / CAMBIO_ESTATUS_FACTURA, AUTORIZAR_DIFERENCIA, RECHAZAR_FACTURA, AUTORIZAR_PAGO, REGISTRAR_PAGO, ESCALAR_FACTURA_PENDIENTE y cambios de estatus. Pendiente en la fase de administración: cambios de datos bancarios y documentos del proveedor (ya soportados por `audit()`).

## Reglas
- **Inmutable**: trigger de BD impide `UPDATE/DELETE` en `audit_logs`.
- Motivo obligatorio (≥ 5–10 caracteres) en rechazos, devoluciones, autorización de diferencias y rechazo de facturas.
- No guardar secretos ni datos bancarios completos en `old_data/new_data`.
- Los intentos bloqueados (duplicados) también se registran.
- Cada pantalla de detalle muestra el historial (`historyFor(tabla, ids)`).

## Ejemplo
```ts
await audit(tx, session, { table: "invoice_differences", recordId: d.id, action: "AUTORIZAR_DIFERENCIA",
  newData: { code: d.code, esperado: d.expected, facturado: d.actual }, comment: input.reason });
```

## Criterios de aceptación
- [ ] Toda acción de la lista deja una fila con usuario, rol, antes/después y motivo cuando aplica.
- [ ] `UPDATE audit_logs …` falla en la BD.
- [ ] El historial visible coincide con la bitácora.
