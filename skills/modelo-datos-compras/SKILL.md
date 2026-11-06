---
name: modelo-datos-compras
description: Modelo relacional Drizzle/PostgreSQL del sistema de compras (26 tablas), invariantes en BD y reglas de migración. Úsalo al crear o cambiar tablas, columnas o índices.
---

# Modelo de datos

## Instrucciones
- Fuente única: `src/db/schema.ts`. Todo cambio → `npm run db:generate -- --name=<descripcion>` → revisar el SQL → commit del archivo en `drizzle/`.
- Nunca editar una migración ya aplicada; crear una nueva. Cambios destructivos en dos pasos (expand → contract).
- Lógica custom (triggers) con `drizzle-kit generate --custom`.

## Tablas
Organización: `users, roles, user_roles, plants, areas, cost_centers` · Catálogos: `suppliers, supplier_documents, supplier_bank_accounts, products, product_categories, units_of_measure` · Solicitudes: `purchase_requests, purchase_request_items` · Órdenes: `purchase_orders, purchase_order_items` · Recepción: `receipts, receipt_items` · Facturación: `invoices, invoice_items, invoice_differences` · Pagos: `payments` · Transversales: `attachments, audit_logs, notifications, system_settings`.

## Convenciones
- PK `uuid`; folios (`SC-`, `OC-`, `RC-`) por **secuencia** de Postgres (atómico).
- Dinero `numeric(18,4)` precios / `(18,2)` totales; cantidades `numeric(18,3)`. Cálculos con `decimal.js`, nunca `number` para dinero.
- Trazabilidad: `created_at/by, updated_at/by, change_reason`.
- Estatus como `pgEnum` (en español, mismos nombres que la UI).
- Datos bancarios: solo `clabe_encrypted` (AES-256-GCM) + `clabe_last4`.

## Invariantes en la BD (no solo en la app)
| Regla | Mecanismo |
|-------|-----------|
| recibido = aceptado + rechazado; sin negativos | `CHECK ri_balance`, `ri_nonneg` |
| Rechazo exige motivo | `CHECK ri_reject_reason` |
| UUID fiscal único | `UNIQUE inv_uuid_uq` |
| Folio único por proveedor (incluye sin serie) | `UNIQUE (supplier, coalesce(series,''), number)` |
| Una factura vigente por proveedor-OC | `UNIQUE parcial … WHERE status <> 'RECHAZADA'` |
| Un pago vigente por factura | `UNIQUE parcial … WHERE status <> 'CANCELADO'` |
| Bitácora inmutable | trigger `audit_logs_immutable` |

## Ejemplo de consulta tipada (acumulado recibido por partida)
```ts
db.select({ item: receiptItems.orderItemId, accepted: sql`sum(${receiptItems.quantityAccepted})` })
  .from(receiptItems).innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
  .where(and(eq(receipts.orderId, id), ne(receipts.status, "CANCELADA"))).groupBy(receiptItems.orderItemId);
```

## Criterios de aceptación
- [ ] `drizzle-kit generate` no produce cambios pendientes en `main`.
- [ ] Toda FK usada en filtros tiene índice.
- [ ] Una migración nueva se prueba en una rama de Neon antes de producción.
