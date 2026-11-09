import "server-only";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  areas, auditLogs, costCenters, invoiceDifferences, invoiceItems, invoices, payments, products, purchaseOrderItems, purchaseOrders,
  purchaseRequestItems, purchaseRequests, receiptItems, receipts, suppliers, unitsOfMeasure, users,
} from "@/db/schema";
import type { Session } from "@/lib/auth";
import { getInvoiceIndicator } from "./services/invoice-service";

export const PAGE_SIZE = 20;
const like = (q: string) => `%${q.replace(/[%_]/g, "\\$&")}%`;
export type Filters = { q?: string; status?: string; page?: number };

/**
 * AISLAMIENTO POR CONSULTA: cada lectura aplica el alcance de la sesión en el WHERE (no en la UI).
 *  - Proveedor: solo filas de su supplier_id.   - Solicitante: solo las suyas.   - Jefe: su área.   - Compras/Admin: todas.
 */
function requestScope(s: Session): SQL | undefined {
  if (s.permissions.has("solicitud:ver_todas")) return undefined;
  if (s.permissions.has("solicitud:ver_area") && s.areaId) return or(eq(purchaseRequests.areaId, s.areaId), eq(purchaseRequests.requesterId, s.userId));
  return eq(purchaseRequests.requesterId, s.userId);
}

export async function listRequests(s: Session, f: Filters) {
  const page = Math.max(1, f.page ?? 1);
  const where = and(
    requestScope(s),
    f.status ? eq(purchaseRequests.status, f.status as never) : undefined,
    f.q ? or(ilike(purchaseRequests.folio, like(f.q)), ilike(purchaseRequests.title, like(f.q))) : undefined,
  );
  const rows = await db.select({
    id: purchaseRequests.id, folio: purchaseRequests.folio, title: purchaseRequests.title, status: purchaseRequests.status,
    createdAt: purchaseRequests.createdAt, requester: users.name, area: areas.name, neededBy: purchaseRequests.neededBy,
  }).from(purchaseRequests).innerJoin(users, eq(users.id, purchaseRequests.requesterId)).innerJoin(areas, eq(areas.id, purchaseRequests.areaId))
    .where(where).orderBy(desc(purchaseRequests.createdAt)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE, page };
}

export async function getRequest(s: Session, id: string) {
  const [r] = await db.select({
    req: purchaseRequests, requester: users.name, area: areas.name, areaHead: areas.headUserId, costCenter: costCenters.name,
  }).from(purchaseRequests).innerJoin(users, eq(users.id, purchaseRequests.requesterId)).innerJoin(areas, eq(areas.id, purchaseRequests.areaId))
    .leftJoin(costCenters, eq(costCenters.id, purchaseRequests.costCenterId)).where(and(eq(purchaseRequests.id, id), requestScope(s)));
  if (!r) return null;
  const items = await db.select({
    id: purchaseRequestItems.id, productId: purchaseRequestItems.productId, product: products.name, sku: products.sku, description: purchaseRequestItems.description,
    quantity: purchaseRequestItems.quantity, uom: unitsOfMeasure.code, estimatedUnitPrice: purchaseRequestItems.estimatedUnitPrice,
  }).from(purchaseRequestItems).innerJoin(products, eq(products.id, purchaseRequestItems.productId)).innerJoin(unitsOfMeasure, eq(unitsOfMeasure.id, purchaseRequestItems.uomId))
    .where(eq(purchaseRequestItems.requestId, id));
  const [order] = await db.select({ id: purchaseOrders.id, folio: purchaseOrders.folio }).from(purchaseOrders).where(eq(purchaseOrders.requestId, id)).limit(1);
  return { ...r, items, order: order ?? null };
}

function orderScope(s: Session): SQL | undefined {
  if (s.isSupplier) return eq(purchaseOrders.supplierId, s.supplierId ?? "00000000-0000-0000-0000-000000000000");
  if (s.permissions.has("oc:ver_todas")) return undefined;
  return sql`false`;
}

export async function listOrders(s: Session, f: Filters, extra?: SQL) {
  const page = Math.max(1, f.page ?? 1);
  const where = and(
    orderScope(s), extra,
    f.status ? eq(purchaseOrders.status, f.status as never) : undefined,
    f.q ? or(ilike(purchaseOrders.folio, like(f.q)), ilike(suppliers.legalName, like(f.q)), ilike(purchaseOrders.trackingNumber, like(f.q))) : undefined,
  );
  const rows = await db.select({
    id: purchaseOrders.id, folio: purchaseOrders.folio, status: purchaseOrders.status, total: purchaseOrders.total, supplier: suppliers.legalName,
    promisedDate: purchaseOrders.promisedDate, createdAt: purchaseOrders.createdAt, trackingNumber: purchaseOrders.trackingNumber,
  }).from(purchaseOrders).innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(where)
    .orderBy(desc(purchaseOrders.createdAt)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE, page };
}

/** Órdenes que pueden recibirse, con búsqueda por folio, proveedor o guía. */
export const listReceivable = (s: Session, f: Filters) =>
  listOrders(s, f, inArray(purchaseOrders.status, ["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"]));

export async function getOrder(s: Session, id: string) {
  const [o] = await db.select({ po: purchaseOrders, supplier: suppliers }).from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId)).where(and(eq(purchaseOrders.id, id), orderScope(s)));
  if (!o) return null;
  const items = await db.select({
    id: purchaseOrderItems.id, productId: purchaseOrderItems.productId, sku: products.sku, description: purchaseOrderItems.description, uom: unitsOfMeasure.code,
    quantity: purchaseOrderItems.quantity, unitPrice: purchaseOrderItems.unitPrice, taxRate: purchaseOrderItems.taxRate, lineSubtotal: purchaseOrderItems.lineSubtotal,
    coldChain: products.requiresColdChain, maxTemp: products.maxArrivalTempC, needsExpiry: products.requiresExpiryDate,
  }).from(purchaseOrderItems).innerJoin(products, eq(products.id, purchaseOrderItems.productId)).innerJoin(unitsOfMeasure, eq(unitsOfMeasure.id, purchaseOrderItems.uomId))
    .where(eq(purchaseOrderItems.orderId, id)).orderBy(asc(purchaseOrderItems.description));
  // Acumulados por partida (recibido / aceptado / rechazado) para «pendiente por recibir»
  const totals = await db.select({
    orderItemId: receiptItems.orderItemId, received: sql<string>`sum(${receiptItems.quantityReceived})`, accepted: sql<string>`sum(${receiptItems.quantityAccepted})`, rejected: sql<string>`sum(${receiptItems.quantityRejected})`,
  }).from(receiptItems).innerJoin(receipts, eq(receipts.id, receiptItems.receiptId)).where(and(eq(receipts.orderId, id), ne(receipts.status, "CANCELADA"))).groupBy(receiptItems.orderItemId);
  const t = new Map(totals.map((x) => [x.orderItemId, x]));
  const recs = await db.select({ id: receipts.id, folio: receipts.folio, status: receipts.status, receivedAt: receipts.receivedAt, by: users.name, invoiceAtReceipt: receipts.invoiceStatusAtReceipt })
    .from(receipts).innerJoin(users, eq(users.id, receipts.receivedBy)).where(eq(receipts.orderId, id)).orderBy(desc(receipts.receivedAt));
  const indicator = await getInvoiceIndicator(db, id);
  return {
    ...o, indicator, receipts: recs,
    items: items.map((i) => ({ ...i, received: t.get(i.id)?.received ?? "0", accepted: t.get(i.id)?.accepted ?? "0", rejected: t.get(i.id)?.rejected ?? "0" })),
  };
}

function invoiceScope(s: Session): SQL | undefined {
  if (s.isSupplier) return eq(invoices.supplierId, s.supplierId ?? "00000000-0000-0000-0000-000000000000");
  if (s.permissions.has("factura:ver_todas")) return undefined;
  return sql`false`;
}

export async function listInvoices(s: Session, f: Filters, extra?: SQL) {
  const page = Math.max(1, f.page ?? 1);
  const where = and(invoiceScope(s), extra, f.status ? eq(invoices.status, f.status as never) : undefined,
    f.q ? or(ilike(invoices.invoiceNumber, like(f.q)), ilike(invoices.uuidCfdi, like(f.q)), ilike(suppliers.legalName, like(f.q)), ilike(purchaseOrders.folio, like(f.q))) : undefined);
  const rows = await db.select({
    id: invoices.id, number: invoices.invoiceNumber, uuid: invoices.uuidCfdi, status: invoices.status, total: invoices.total, issuedAt: invoices.issuedAt,
    supplier: suppliers.legalName, orderId: purchaseOrders.id, orderFolio: purchaseOrders.folio, blockedReason: invoices.blockedReason,
  }).from(invoices).innerJoin(suppliers, eq(suppliers.id, invoices.supplierId)).innerJoin(purchaseOrders, eq(purchaseOrders.id, invoices.orderId))
    .where(where).orderBy(desc(invoices.createdAt)).limit(PAGE_SIZE + 1).offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE, page };
}

export async function getInvoice(s: Session, id: string) {
  const [r] = await db.select({ inv: invoices, supplier: suppliers.legalName, orderFolio: purchaseOrders.folio })
    .from(invoices).innerJoin(suppliers, eq(suppliers.id, invoices.supplierId)).innerJoin(purchaseOrders, eq(purchaseOrders.id, invoices.orderId))
    .where(and(eq(invoices.id, id), invoiceScope(s)));
  if (!r) return null;
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  const diffs = await db.select().from(invoiceDifferences).where(eq(invoiceDifferences.invoiceId, id)).orderBy(asc(invoiceDifferences.severity));
  const [pay] = await db.select().from(payments).where(and(eq(payments.invoiceId, id), ne(payments.status, "CANCELADO"))).limit(1);
  return { ...r, items, diffs, payment: pay ?? null };
}

export const listPayments = (status: "AUTORIZADO") => db.select({
  id: payments.id, amount: payments.amount, status: payments.status, supplier: suppliers.legalName, invoiceId: invoices.id, invoiceNumber: invoices.invoiceNumber, authorizedAt: payments.authorizedAt,
}).from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(suppliers, eq(suppliers.id, payments.supplierId)).where(eq(payments.status, status)).orderBy(desc(payments.authorizedAt));

export async function historyFor(table: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: auditLogs.id, at: auditLogs.at, userName: auditLogs.userName, action: auditLogs.action, comment: auditLogs.comment })
    .from(auditLogs).where(and(eq(auditLogs.tableName, table), inArray(auditLogs.recordId, ids))).orderBy(desc(auditLogs.at)).limit(50);
}

/** Catálogos para formularios */
export const catalogProducts = () => db.select({ id: products.id, sku: products.sku, name: products.name, uom: unitsOfMeasure.code })
  .from(products).innerJoin(unitsOfMeasure, eq(unitsOfMeasure.id, products.uomId)).where(eq(products.active, true)).orderBy(asc(products.name));
export const catalogCostCenters = () => db.select({ id: costCenters.id, code: costCenters.code, name: costCenters.name }).from(costCenters).where(eq(costCenters.active, true)).orderBy(asc(costCenters.name));
export const catalogSuppliers = () => db.select({ id: suppliers.id, name: suppliers.legalName, rfc: suppliers.rfc, status: suppliers.status, docs: suppliers.documentsValidUntil })
  .from(suppliers).where(eq(suppliers.status, "AUTORIZADO")).orderBy(asc(suppliers.legalName));

/** Tablero por rol: conteos de lo que está esperando acción de la persona. */
export async function dashboardCounts(s: Session) {
  const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const out: { label: string; value: number; href: string; hint?: string }[] = [];
  if (s.permissions.has("solicitud:decidir") && s.areaId)
    out.push({ label: "Solicitudes por aprobar", href: "/solicitudes?status=ENVIADA", value: await count(db.select({ n: sql<number>`count(*)` }).from(purchaseRequests).where(and(eq(purchaseRequests.areaId, s.areaId), inArray(purchaseRequests.status, ["ENVIADA", "EN_REVISION"])))) });
  if (s.permissions.has("solicitud:crear"))
    out.push({ label: "Mis solicitudes devueltas", href: "/solicitudes?status=DEVUELTA", value: await count(db.select({ n: sql<number>`count(*)` }).from(purchaseRequests).where(and(eq(purchaseRequests.requesterId, s.userId), eq(purchaseRequests.status, "DEVUELTA")))) });
  if (s.permissions.has("oc:crear")) {
    out.push({ label: "Aprobadas por convertir en OC", href: "/solicitudes?status=APROBADA", value: await count(db.select({ n: sql<number>`count(*)` }).from(purchaseRequests).where(eq(purchaseRequests.status, "APROBADA"))) });
    out.push({ label: "OC por enviar al proveedor", href: "/ordenes?status=OC_GENERADA", value: await count(db.select({ n: sql<number>`count(*)` }).from(purchaseOrders).where(eq(purchaseOrders.status, "OC_GENERADA"))) });
  }
  if (s.permissions.has("recepcion:registrar")) {
    out.push({ label: "OC listas para recibir", href: "/recepcion", value: await count(db.select({ n: sql<number>`count(*)` }).from(purchaseOrders).where(inArray(purchaseOrders.status, ["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"]))) });
    out.push({ label: "Recepciones sin factura", href: "/recepcion", hint: "Pago bloqueado", value: await count(db.select({ n: sql<number>`count(*)` }).from(receipts).where(eq(receipts.status, "PENDIENTE_FACTURA"))) });
  }
  if (s.permissions.has("factura:autorizar_diferencia")) {
    out.push({ label: "Facturas con diferencia", href: "/facturas?status=CON_DIFERENCIA", value: await count(db.select({ n: sql<number>`count(*)` }).from(invoices).where(inArray(invoices.status, ["CON_DIFERENCIA", "EN_VALIDACION"]))) });
    out.push({ label: "Facturas bloqueadas", href: "/facturas?status=BLOQUEADA", value: await count(db.select({ n: sql<number>`count(*)` }).from(invoices).where(eq(invoices.status, "BLOQUEADA"))) });
  }
  if (s.permissions.has("pago:autorizar")) {
    out.push({ label: "Listas para autorizar pago", href: "/pagos", value: await count(db.select({ n: sql<number>`count(*)` }).from(invoices).where(eq(invoices.status, "LISTA_PARA_PAGO"))) });
    out.push({ label: "Pagos por registrar", href: "/pagos", value: await count(db.select({ n: sql<number>`count(*)` }).from(payments).where(eq(payments.status, "AUTORIZADO"))) });
  }
  if (s.isSupplier && s.supplierId) {
    out.push({ label: "OC por confirmar", href: "/proveedor", value: await count(db.select({ n: sql<number>`count(*)` }).from(purchaseOrders).where(and(eq(purchaseOrders.supplierId, s.supplierId), eq(purchaseOrders.status, "ENVIADA_PROVEEDOR")))) });
    out.push({ label: "Mis facturas bloqueadas / con diferencia", href: "/proveedor", value: await count(db.select({ n: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.supplierId, s.supplierId), inArray(invoices.status, ["BLOQUEADA", "CON_DIFERENCIA"])))) });
  }
  return out;
}

/** Tablero de seguimiento para Compras/Finanzas: lo que está atorado y cuánto dinero detiene. */
export async function seguimiento() {
  const [sinFactura, conProblema, sinConfirmar, porPagar] = await Promise.all([
    db.select({ id: receipts.id, folio: receipts.folio, orderId: purchaseOrders.id, orderFolio: purchaseOrders.folio, supplier: suppliers.legalName, receivedAt: receipts.receivedAt, total: purchaseOrders.total })
      .from(receipts).innerJoin(purchaseOrders, eq(purchaseOrders.id, receipts.orderId)).innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(eq(receipts.status, "PENDIENTE_FACTURA")).orderBy(asc(receipts.receivedAt)).limit(200),
    db.select({
      id: invoices.id, number: invoices.invoiceNumber, status: invoices.status, total: invoices.total, createdAt: invoices.createdAt, orderFolio: purchaseOrders.folio, supplier: suppliers.legalName,
      detail: sql<string | null>`(select d.message from invoice_differences d where d.invoice_id = ${invoices.id} order by d.requires_authorization desc, d.detected_at limit 1)`,
    }).from(invoices).innerJoin(purchaseOrders, eq(purchaseOrders.id, invoices.orderId)).innerJoin(suppliers, eq(suppliers.id, invoices.supplierId))
      .where(inArray(invoices.status, ["CON_DIFERENCIA", "BLOQUEADA", "EN_VALIDACION"])).orderBy(asc(invoices.createdAt)).limit(200),
    db.select({ id: purchaseOrders.id, folio: purchaseOrders.folio, supplier: suppliers.legalName, sentAt: purchaseOrders.sentAt, total: purchaseOrders.total })
      .from(purchaseOrders).innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(eq(purchaseOrders.status, "ENVIADA_PROVEEDOR")).orderBy(asc(purchaseOrders.sentAt)).limit(200),
    db.select({ n: sql<number>`count(*)`, total: sql<string>`coalesce(sum(${invoices.total}), 0)` }).from(invoices).where(eq(invoices.status, "LISTA_PARA_PAGO")),
  ]);
  return { sinFactura, conProblema, sinConfirmar, porPagar: { n: Number(porPagar[0]?.n ?? 0), total: porPagar[0]?.total ?? "0" } };
}
