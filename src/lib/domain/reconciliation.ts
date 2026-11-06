/**
 * Conciliación de TRES VÍAS: Orden de compra ↔ Recepción (aceptada) ↔ Factura.
 * Función PURA (sin BD): recibe datos ya cargados y devuelve el veredicto + diferencias.
 * Es la única fuente de verdad de las reglas; la usan la carga de factura, la recepción y la autorización de pago.
 */
import Decimal from "decimal.js";

export type Tolerances = {
  /** Diferencia porcentual de precio unitario permitida sin autorización (0 = exacto). */
  pricePct: number;
  /** Tolerancia absoluta en pesos para redondeos de importes (p. ej. 0.01). */
  amountAbs: number;
};

export type OrderLine = { id: string; sku: string; uomCode: string; quantity: string; unitPrice: string; taxRate: string };
export type ReceiptLine = { orderItemId: string; received: string; accepted: string; rejected: string };
export type InvoiceLine = {
  orderItemId: string | null; description: string; uomCode: string | null;
  quantity: string; unitPrice: string; subtotal: string; taxAmount: string;
};
export type InvoiceHead = { supplierId: string; issuerRfc: string; receiverRfc?: string; subtotal: string; taxTotal: string; total: string };

export type ReconInput = {
  order: { supplierId: string; supplierRfc: string; lines: OrderLine[] };
  receipts: ReceiptLine[]; // todas las recepciones de la OC (se agregan por línea)
  invoice: { head: InvoiceHead; lines: InvoiceLine[] };
  tolerances: Tolerances;
  /** RFC receptor esperado (el de la empresa). null/undefined = no validar. */
  expectedReceiverRfc?: string | null;
  /** Claves "codigo|orderItemId" ya autorizadas por un usuario con permiso → pasan a AVISO. */
  authorized?: ReadonlySet<string>;
};

export type DiffCode =
  | "PROVEEDOR_DISTINTO" | "PRODUCTO_NO_ORDENADO" | "CANTIDAD_EXCEDE_ACEPTADA" | "CANTIDAD_RECHAZADA_FACTURADA"
  | "PRECIO_DISTINTO" | "PRECIO_EN_TOLERANCIA" | "UNIDAD_DISTINTA" | "SUBTOTAL_LINEA" | "IVA_DISTINTO"
  | "RECEPTOR_DISTINTO" | "TOTALES_NO_CUADRAN" | "TOTAL_EXCEDE_ACEPTADO" | "CANTIDAD_MENOR_ACEPTADA";

export type Difference = {
  code: DiffCode;
  severity: "BLOQUEO" | "DIFERENCIA" | "AVISO";
  orderItemId: string | null;
  message: string;
  expected?: string;
  actual?: string;
  /** true = un usuario autorizado puede aceptarla (p. ej. precio fuera de tolerancia). Los BLOQUEOS nunca. */
  requiresAuthorization: boolean;
};

export type ReconOutcome = "PENDIENTE_RECEPCION" | "CONCILIADA" | "CON_DIFERENCIA" | "BLOQUEADA";
export type ReconResult = {
  outcome: ReconOutcome;
  differences: Difference[];
  /** Monto máximo pagable = aceptado × precio OC (+IVA). Referencia para Finanzas. */
  payableSubtotal: string;
  payableTotal: string;
};

export const diffKey = (code: string, orderItemId: string | null) => `${code}|${orderItemId ?? ""}`;
const D = (v: string | number) => new Decimal(v);
const fmt = (d: Decimal) => d.toFixed(2);

export function reconcile(input: ReconInput): ReconResult {
  const { order, invoice, tolerances: tol } = input;
  const diffs: Difference[] = [];
  const add = (d: Omit<Difference, "requiresAuthorization"> & { requiresAuthorization?: boolean }) => {
    const requiresAuthorization = d.requiresAuthorization ?? false;
    // Una diferencia autorizable que ya fue autorizada baja a AVISO (queda registrada, no bloquea).
    const authorized = requiresAuthorization && input.authorized?.has(diffKey(d.code, d.orderItemId));
    diffs.push({ ...d, requiresAuthorization, severity: authorized ? "AVISO" : d.severity });
  };

  const byId = new Map(order.lines.map((l) => [l.id, l]));
  const agg = new Map<string, { received: Decimal; accepted: Decimal; rejected: Decimal }>();
  for (const r of input.receipts) {
    const a = agg.get(r.orderItemId) ?? { received: D(0), accepted: D(0), rejected: D(0) };
    agg.set(r.orderItemId, { received: a.received.plus(r.received), accepted: a.accepted.plus(r.accepted), rejected: a.rejected.plus(r.rejected) });
  }

  // 1) Proveedor: la factura debe ser del proveedor de la OC (id y RFC emisor)
  if (invoice.head.supplierId !== order.supplierId || invoice.head.issuerRfc.trim().toUpperCase() !== order.supplierRfc.trim().toUpperCase()) {
    add({ code: "PROVEEDOR_DISTINTO", severity: "BLOQUEO", orderItemId: null, message: "El emisor de la factura no corresponde al proveedor de la orden de compra.", expected: order.supplierRfc, actual: invoice.head.issuerRfc });
  }

  if (input.expectedReceiverRfc && invoice.head.receiverRfc && invoice.head.receiverRfc.trim().toUpperCase() !== input.expectedReceiverRfc.trim().toUpperCase()) {
    add({ code: "RECEPTOR_DISTINTO", severity: "BLOQUEO", orderItemId: null, message: "El RFC receptor de la factura no es el de la empresa.", expected: input.expectedReceiverRfc, actual: invoice.head.receiverRfc });
  }

  // Payable de referencia
  let payableSub = D(0), payableTax = D(0);
  for (const l of order.lines) {
    const acc = agg.get(l.id)?.accepted ?? D(0);
    const sub = acc.times(l.unitPrice);
    payableSub = payableSub.plus(sub);
    payableTax = payableTax.plus(sub.times(l.taxRate));
  }
  const payable = { payableSubtotal: fmt(payableSub), payableTotal: fmt(payableSub.plus(payableTax)) };

  const anyReceived = [...agg.values()].some((a) => a.received.gt(0));
  const hardSupplierBlock = diffs.some((d) => d.severity === "BLOQUEO");
  if (!anyReceived) {
    // Sin recepción no hay contra qué conciliar: la factura espera. Pago bloqueado.
    return { outcome: hardSupplierBlock ? "BLOQUEADA" : "PENDIENTE_RECEPCION", differences: diffs, ...payable };
  }

  // 2) Líneas de factura
  const invoicedByItem = new Map<string, Decimal>();
  for (const il of invoice.lines) {
    const ol = il.orderItemId ? byId.get(il.orderItemId) : undefined;
    if (!ol) {
      add({ code: "PRODUCTO_NO_ORDENADO", severity: "BLOQUEO", orderItemId: null, message: `El concepto «${il.description}» no corresponde a ninguna partida de la orden de compra.`, actual: il.description });
      continue;
    }
    invoicedByItem.set(ol.id, (invoicedByItem.get(ol.id) ?? D(0)).plus(il.quantity));

    // Unidad de medida
    if (il.uomCode && il.uomCode.trim().toUpperCase() !== ol.uomCode.trim().toUpperCase()) {
      add({ code: "UNIDAD_DISTINTA", severity: "DIFERENCIA", orderItemId: ol.id, message: `Unidad de medida distinta en «${il.description}».`, expected: ol.uomCode, actual: il.uomCode, requiresAuthorization: true });
    }
    // Precio unitario vs OC (tolerancia configurable)
    const op = D(ol.unitPrice), ip = D(il.unitPrice);
    if (!ip.eq(op)) {
      const pct = op.isZero() ? D(100) : ip.minus(op).abs().div(op).times(100);
      if (pct.gt(tol.pricePct)) {
        add({ code: "PRECIO_DISTINTO", severity: "DIFERENCIA", orderItemId: ol.id, message: `Precio unitario distinto al de la OC en «${il.description}» (${pct.toFixed(2)} %, tolerancia ${tol.pricePct} %).`, expected: op.toFixed(4), actual: ip.toFixed(4), requiresAuthorization: true });
      } else {
        add({ code: "PRECIO_EN_TOLERANCIA", severity: "AVISO", orderItemId: ol.id, message: `Diferencia de precio dentro de tolerancia en «${il.description}».`, expected: op.toFixed(4), actual: ip.toFixed(4) });
      }
    }
    // Aritmética de la línea
    const calc = D(il.quantity).times(il.unitPrice);
    if (calc.minus(il.subtotal).abs().gt(tol.amountAbs)) {
      add({ code: "SUBTOTAL_LINEA", severity: "DIFERENCIA", orderItemId: ol.id, message: `Importe de «${il.description}» no coincide con cantidad × precio.`, expected: fmt(calc), actual: il.subtotal, requiresAuthorization: false });
    }
    // IVA vs tasa de la OC
    const expTax = D(il.subtotal).times(ol.taxRate);
    if (expTax.minus(il.taxAmount).abs().gt(tol.amountAbs)) {
      add({ code: "IVA_DISTINTO", severity: "DIFERENCIA", orderItemId: ol.id, message: `IVA de «${il.description}» distinto al esperado según la OC.`, expected: fmt(expTax), actual: il.taxAmount, requiresAuthorization: true });
    }
  }

  // 3) Cantidad facturada vs recibida y ACEPTADA (rechazado nunca se paga)
  for (const ol of order.lines) {
    const inv = invoicedByItem.get(ol.id);
    if (!inv) continue;
    const a = agg.get(ol.id) ?? { received: D(0), accepted: D(0), rejected: D(0) };
    if (inv.gt(a.accepted)) {
      const rejectedBilled = a.rejected.gt(0) && inv.lte(a.accepted.plus(a.rejected));
      add(rejectedBilled
        ? { code: "CANTIDAD_RECHAZADA_FACTURADA", severity: "BLOQUEO", orderItemId: ol.id, message: `Se facturó cantidad rechazada por Calidad (${a.rejected.toString()} rechazadas). Las cantidades rechazadas no se pagan.`, expected: a.accepted.toString(), actual: inv.toString() }
        : { code: "CANTIDAD_EXCEDE_ACEPTADA", severity: "BLOQUEO", orderItemId: ol.id, message: "La cantidad facturada es mayor que la cantidad recibida y aceptada.", expected: a.accepted.toString(), actual: inv.toString() });
    } else if (inv.lt(a.accepted)) {
      add({ code: "CANTIDAD_MENOR_ACEPTADA", severity: "AVISO", orderItemId: ol.id, message: "Se facturó menos de lo aceptado; la diferencia queda pendiente de facturar.", expected: a.accepted.toString(), actual: inv.toString() });
    }
  }

  // 4) Totales del comprobante
  const sumSub = invoice.lines.reduce((s, l) => s.plus(l.subtotal), D(0));
  const sumTax = invoice.lines.reduce((s, l) => s.plus(l.taxAmount), D(0));
  const h = invoice.head;
  if (sumSub.minus(h.subtotal).abs().gt(tol.amountAbs) || sumTax.minus(h.taxTotal).abs().gt(tol.amountAbs) ||
      D(h.subtotal).plus(h.taxTotal).minus(h.total).abs().gt(tol.amountAbs)) {
    add({ code: "TOTALES_NO_CUADRAN", severity: "DIFERENCIA", orderItemId: null, message: "Subtotal, IVA y total de la factura no cuadran con sus conceptos.", expected: `${fmt(sumSub)} + ${fmt(sumTax)}`, actual: `${h.subtotal} + ${h.taxTotal} = ${h.total}` });
  }
  if (D(h.total).minus(payable.payableTotal).gt(tol.amountAbs) && !diffs.some((d) => d.severity === "BLOQUEO" || d.code === "PRECIO_DISTINTO")) {
    add({ code: "TOTAL_EXCEDE_ACEPTADO", severity: "DIFERENCIA", orderItemId: null, message: "El total facturado excede el valor de lo recibido y aceptado según la OC.", expected: payable.payableTotal, actual: h.total, requiresAuthorization: true });
  }

  const outcome: ReconOutcome = diffs.some((d) => d.severity === "BLOQUEO") ? "BLOQUEADA"
    : diffs.some((d) => d.severity === "DIFERENCIA") ? "CON_DIFERENCIA" : "CONCILIADA";
  return { outcome, differences: diffs, ...payable };
}
