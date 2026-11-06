---
name: validacion-factura-recepcion
description: Regla obligatoria de consulta de factura al recibir mercancía y conciliación de tres vías (OC, recepción aceptada, factura). Úsalo al modificar recepción, carga de factura, conciliación o liberación de pago.
---

# Validación de factura en recepción y conciliación de tres vías

## Instrucciones
1. Al abrir `/recepcion/[ordenId]` el **servidor** consulta `getInvoiceIndicator()` (nunca se confía en el cliente).
2. Se muestra el indicador: **No cargada · Cargada · En validación · Con diferencia · Conciliada · Bloqueada**.
3. El botón «Ver factura del proveedor» solo se habilita si existe factura (enlace firmado de 5 min).
4. Al guardar, el servidor **vuelve a consultar** dentro de la transacción con la OC bloqueada (`FOR UPDATE`) y decide el estatus de la recepción.

## Mensaje obligatorio (sin factura)
> La factura aún no ha sido cargada por el proveedor. La recepción quedará pendiente de conciliación y el pago permanecerá bloqueado.

Constante única: `MISSING_INVOICE_WARNING` en `invoice-service.ts`.

## Reglas
- Sin factura → recepción `PENDIENTE_FACTURA` (se permite registrar). Con factura → `COMPLETADA` y se concilia.
- La función pura `reconcile()` (`src/lib/domain/reconciliation.ts`) compara cantidad, precio unitario, subtotal, IVA, total, producto, unidad y proveedor.
- Cantidad facturada > aceptada → **BLOQUEADA**. Si el excedente corresponde a lo rechazado → `CANTIDAD_RECHAZADA_FACTURADA`.
- Precio ≠ OC fuera de tolerancia (`tolerancia.precio_pct`) → **CON_DIFERENCIA**, autorizable con motivo. Dentro de tolerancia → aviso.
- Concepto sin partida de OC, proveedor/RFC emisor distinto o RFC receptor distinto → **BLOQUEADA** (no autorizable; se rechaza y se recarga).
- UUID repetido, folio repetido del proveedor o segunda factura vigente de la OC → carga rechazada y registrada (`FACTURA_DUPLICADA_BLOQUEADA`); además lo garantizan índices UNIQUE.
- Cada nueva recepción re-evalúa las facturas `CARGADA/CON_DIFERENCIA/BLOQUEADA/EN_VALIDACION` de la OC.
- Liberar pago exige factura `LISTA_PARA_PAGO` **y** que `authorizePayment` re-ejecute `reconcile()` = `CONCILIADA` en ese instante.

## Validaciones de carga (`uploadInvoice`)
PDF **y** XML; tipo real por firma del archivo; ≤ 10 MB; CFDI timbrado (UUID válido); RFC emisor = RFC del proveedor; RFC receptor = `empresa.rfc` (si está configurado); moneda = moneda de la OC; proveedor autorizado y con documentos vigentes.

## Ejemplos (cubiertos en `reconciliation.test.ts`)
| Caso | Resultado |
|------|-----------|
| 100 ord / 100 acep / 100 fact, mismo precio | CONCILIADA |
| 100 recibidas, 80 acep + 20 rech, 100 fact | BLOQUEADA |
| Precio 52 vs 50, tolerancia 0 % | CON_DIFERENCIA → autorizada → CONCILIADA |
| Sin recepción | PENDIENTE_RECEPCION (factura queda CARGADA) |

## Criterios de aceptación
- [ ] El mensaje obligatorio aparece tal cual cuando no hay factura.
- [ ] No existe ruta (UI, acción o SQL de la app) que cree un pago con la factura no conciliada.
- [ ] `npm test` pasa; toda regla nueva tiene un caso en `reconciliation.test.ts`.
