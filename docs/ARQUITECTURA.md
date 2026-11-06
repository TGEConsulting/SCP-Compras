# Arquitectura y decisiones

## 1. Vista general

```
Navegador ──► Next.js 14 (Vercel, App Router)
               ├─ Server Components  → lecturas (queries.ts, con alcance por rol en el WHERE)
               ├─ Server Actions     → TODA mutación (defineAction: sesión → permiso → Zod → transacción → auditoría → outbox)
               ├─ /api/archivos/[id] → descarga firmada de Blob privado
               └─ /api/cron/*        → recordatorios y escalamiento (CRON_SECRET)
                    │
        ┌───────────┼──────────────┬───────────────┐
      Neon (PG)  Vercel Blob    Clerk (identidad)  Resend (correo)
      pooler+WS   privado
```

Capas (dependencias solo hacia abajo): `app/` (UI) → `components/` → `server/actions` → `server/services` + `lib/domain` (puro) → `db`. La conciliación (`lib/domain/reconciliation.ts`) no conoce la BD: se prueba sola.

## 2. Roles y permisos
Ver `src/lib/permissions.ts` y `skills/seguridad-y-roles`. Los roles se guardan en BD (`roles`, `user_roles`); Clerk solo autentica.

## 3. Flujo detallado

**Solicitud**: `BORRADOR → ENVIADA → EN_REVISION → APROBADA | RECHAZADA | DEVUELTA (→ edición → ENVIADA)`. Solo el jefe del área (`areas.head_user_id`), nunca el propio solicitante.

**Orden de compra**: la solicitud aprobada se bloquea (`FOR UPDATE`), se valida proveedor autorizado/documentos vigentes, cantidades y unidades salen de la solicitud, se calculan totales con `decimal.js`. `OC_GENERADA → ENVIADA_PROVEEDOR → CONFIRMADA → EN_TRANSITO → RECIBIDA_PARCIAL|TOTAL`.

**Recepción** (`registerReceipt`, una transacción): bloquea la OC → valida calidad por partida → consulta la factura **en servidor** → inserta recepción (`PENDIENTE_FACTURA` o `COMPLETADA`) y partidas → adjunta fotos → actualiza estatus de la OC → si hay factura, re-concilia → auditoría y notificaciones (outbox).

**Factura** (`uploadInvoice`): sube PDF+XML a Blob → parsea CFDI → bloquea la OC → pre-chequeos de duplicado → inserta factura y partidas (emparejadas con la OC por SKU/descripción) → marca recepciones pendientes como `COMPLETADA` → concilia.

**Conciliación**: `reconcile()` → `CONCILIADA` (→ `LISTA_PARA_PAGO`), `CON_DIFERENCIA` (autorizable con motivo → `EN_VALIDACION` hasta resolver todas), `BLOQUEADA` (no autorizable), `PENDIENTE_RECEPCION` (factura queda `CARGADA`).

**Pago**: `authorizePayment` (Finanzas) re-ejecuta la conciliación en ese momento; `registerPayment` guarda referencia y comprobante → factura `PAGADA`.

## 4. Decisiones técnicas importantes
| Decisión | Razón |
|----------|-------|
| Clerk para autenticación | MFA, sesiones y recuperación gestionadas; menos superficie de ataque que contraseñas propias. Roles en BD para no depender del proveedor de identidad. |
| Driver `neon-serverless` (WebSocket) + pool pequeño | Necesitamos transacciones interactivas; el endpoint *pooler* evita agotar conexiones en serverless. |
| `SELECT … FOR UPDATE` sobre la OC | Serializa recepciones y cargas de factura de una misma orden → sin carreras; los índices UNIQUE son la segunda barrera. |
| Conciliación como función pura | Es la regla más crítica; se prueba sin BD y se reutiliza en carga, recepción y pago. |
| Re-validar al autorizar el pago | El estatus guardado podría ser obsoleto; el pago nunca depende solo de él. |
| Outbox de notificaciones | Evita correos de acciones revertidas y pérdida de correos de acciones confirmadas; el cron reintenta. |
| Auditoría en la misma transacción + inmutable | Trazabilidad que no puede divergir ni editarse. |
| Validación por consulta en vez de RLS (MVP) | RLS con Neon exige un rol/`SET` por solicitud; se deja para la iteración 2 como defensa adicional. |
| Migraciones fuera del build | Un build fallido no deja el esquema a medias; se aplican como paso explícito y probado en rama. |
| Un solo `defineAction` | Imposible olvidar auth/Zod/manejo de errores en una acción nueva. |

## 5. Supuestos tomados (revisar y confirmar)
Donde faltaba información se eligió la opción **más restrictiva** y configurable; no se inventaron reglas de negocio permisivas.

1. **Tolerancia de precio = 0 %** (`tolerancia.precio_pct`); redondeo $0.01.
2. **Una factura vigente por OC** (pedido en la validación proveedor-orden). Para entregas parciales con varias facturas hay que relajar el índice `inv_supplier_order_active_uq`.
3. **Quién autoriza diferencias**: Compras y Finanzas.
4. **Recepción solo con OC confirmada** por el proveedor (`CONFIRMADA/EN_TRANSITO/RECIBIDA_PARCIAL`).
5. **Almacén y Calidad** tienen el mismo permiso de registrar recepción/inspección (no se separó «cuenta» de «dictamina»).
6. **Sobre-entrega 0 %**; lo rechazado no consume la cantidad ordenada.
7. **IVA 16 %** por defecto, editable por partida en la OC.
8. **XML obligatorio** en el MVP (el sistema lee los datos del CFDI). No se valida contra el SAT.
9. Escalamiento en **días hábiles lun–vie** sin calendario de festivos.
10. Una solicitud genera **una** OC y un único proveedor.

## 6. Preguntas abiertas (necesito tu confirmación antes de la iteración 2)
- ¿Quién dictamina la aceptación: Almacén cuenta y **Calidad** dictamina, o cualquiera de los dos?
- ¿Se puede recibir **antes** de que el proveedor confirme la OC?
- ¿Una OC puede tener **varias facturas** (entregas parciales)?
- ¿Tolerancia de precio/monto distinta por categoría o proveedor? ¿Quién aprueba sobre qué monto?
- ¿Requisito de **ficha técnica/certificado vigente** como condición para recibir?
- ¿RFC receptor y razón social oficiales para validar CFDI? ¿Complementos de pago o notas de crédito?
- ¿Aprobación adicional por monto (p. ej. Dirección) en solicitudes u OC?
- ¿Separación de funciones en pagos (quien autoriza ≠ quien registra)?
- ¿Formato/plantilla de la OC en PDF (logotipo, términos y condiciones)?
