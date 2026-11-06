import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { Session } from "@/lib/auth";
import type { DbOrTx } from "@/db";
import {
  invoiceDifferences, invoiceItems, invoices, products, purchaseOrderItems, purchaseOrders, receiptItems, receipts,
  roles, suppliers, unitsOfMeasure, userRoles, users, type RoleCode,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { diffKey, reconcile, type ReconResult } from "@/lib/domain/reconciliation";
import { enqueue, type NotifyInput } from "@/lib/notify";
import { getSettings, getTolerances } from "@/lib/settings";

export type InvoiceIndicator = "NO_CARGADA" | "CARGADA" | "EN_VALIDACION" | "CON_DIFERENCIA" | "CONCILIADA" | "BLOQUEADA";

export const INDICATOR_LABEL: Record<InvoiceIndicator, string> = {
  NO_CARGADA: "No cargada", CARGADA: "Cargada", EN_VALIDACION: "En validación",
  CON_DIFERENCIA: "Con diferencia", CONCILIADA: "Conciliada", BLOQUEADA: "Bloqueada",
};
export const MISSING_INVOICE_WARNING =
  "La factura aún no ha sido cargada por el proveedor. La recepción quedará pendiente de conciliación y el pago permanecerá bloqueado.";

/** Factura vigente de la OC (las RECHAZADAS no cuentan: el proveedor puede volver a cargar). */
export async function activeInvoiceFor(tx: DbOrTx, orderId: string) {
  const [inv] = await tx.select().from(invoices).where(and(eq(invoices.orderId, orderId), ne(invoices.status, "RECHAZADA"))).limit(1);
  return inv ?? null;
}

/** Regla obligatoria: al abrir la recepción se consulta SIEMPRE el estatus de factura en servidor. */
export async function getInvoiceIndicator(tx: DbOrTx, orderId: string): Promise<{ state: InvoiceIndicator; invoiceId: string | null; pdfAttachmentId: string | null }> {
  const inv = await activeInvoiceFor(tx, orderId);
  if (!inv) return { state: "NO_CARGADA", invoiceId: null, pdfAttachmentId: null };
  const map: Record<string, InvoiceIndicator> = {
    CARGADA: "CARGADA", EN_VALIDACION: "EN_VALIDACION", CON_DIFERENCIA: "CON_DIFERENCIA",
    CONCILIADA: "CONCILIADA", LISTA_PARA_PAGO: "CONCILIADA", PAGADA: "CONCILIADA", BLOQUEADA: "BLOQUEADA",
  };
  return { state: map[inv.status] ?? "CARGADA", invoiceId: inv.id, pdfAttachmentId: inv.pdfAttachmentId };
}

export async function recipientsByRole(tx: DbOrTx, codes: RoleCode[]) {
  return tx.select({ id: users.id, email: users.email, name: users.name }).from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(inArray(roles.code, codes), eq(users.active, true)));
}

/** Correos para el proveedor: su correo general + usuarios del portal. */
export async function supplierRecipients(tx: DbOrTx, supplierId: string) {
  const [s] = await tx.select({ email: suppliers.email }).from(suppliers).where(eq(suppliers.id, supplierId));
  const us = await tx.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.supplierId, supplierId), eq(users.active, true)));
  const set = new Map<string, string | null>();
  if (s) set.set(s.email.toLowerCase(), null);
  for (const u of us) set.set(u.email.toLowerCase(), u.id);
  return [...set.entries()].map(([email, id]) => ({ email, userId: id }));
}

/** Carga todo lo necesario para conciliar y ejecuta la función pura. NO escribe. */
export async function evaluateInvoice(tx: DbOrTx, invoiceId: string): Promise<{ result: ReconResult; hasAuthorized: boolean; authorizedRows: typeof invoiceDifferences.$inferSelect[] }> {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new Error("Factura no encontrada");
  const [sup] = await tx.select({ rfc: suppliers.rfc }).from(suppliers).where(eq(suppliers.id, inv.supplierId));
  const [order] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, inv.orderId));
  if (!order || !sup) throw new Error("Orden o proveedor no encontrado");

  const lines = await tx.select({
    id: purchaseOrderItems.id, sku: products.sku, uomCode: unitsOfMeasure.code, quantity: purchaseOrderItems.quantity,
    unitPrice: purchaseOrderItems.unitPrice, taxRate: purchaseOrderItems.taxRate,
  }).from(purchaseOrderItems).innerJoin(products, eq(products.id, purchaseOrderItems.productId))
    .innerJoin(unitsOfMeasure, eq(unitsOfMeasure.id, purchaseOrderItems.uomId)).where(eq(purchaseOrderItems.orderId, order.id));

  const recs = await tx.select({
    orderItemId: receiptItems.orderItemId, received: receiptItems.quantityReceived, accepted: receiptItems.quantityAccepted, rejected: receiptItems.quantityRejected,
  }).from(receiptItems).innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
    .where(and(eq(receipts.orderId, order.id), ne(receipts.status, "CANCELADA")));

  const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
  const authorizedRows = await tx.select().from(invoiceDifferences).where(and(eq(invoiceDifferences.invoiceId, inv.id), isNotNull(invoiceDifferences.authorizedAt)));
  const s = await getSettings(tx, ["empresa.rfc"]);

  const result = reconcile({
    order: { supplierId: order.supplierId, supplierRfc: sup.rfc, lines },
    receipts: recs,
    invoice: {
      head: { supplierId: inv.supplierId, issuerRfc: inv.issuerRfc, receiverRfc: inv.receiverRfc, subtotal: inv.subtotal, taxTotal: inv.taxTotal, total: inv.total },
      lines: items.map((i) => ({ orderItemId: i.orderItemId, description: i.description, uomCode: i.uomCode, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal, taxAmount: i.taxAmount })),
    },
    tolerances: await getTolerances(tx),
    expectedReceiverRfc: s["empresa.rfc"],
    authorized: new Set(authorizedRows.map((d) => diffKey(d.code, d.orderItemId))),
  });
  return { result, hasAuthorized: authorizedRows.length > 0, authorizedRows };
}

const RERUNNABLE = ["CARGADA", "EN_VALIDACION", "CON_DIFERENCIA", "BLOQUEADA"] as const;

/**
 * Concilia, PERSISTE diferencias y estatus, audita y encola notificaciones.
 * Debe llamarse dentro de una transacción que ya tenga bloqueada la fila de la OC (SELECT … FOR UPDATE).
 * Devuelve los ids de notificaciones para enviarlas después del commit.
 */
export async function runReconciliation(tx: DbOrTx, session: Session | null, invoiceId: string, comment?: string): Promise<{ status: string; notifIds: string[] }> {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
  if (!inv) throw new Error("Factura no encontrada");
  if (!(RERUNNABLE as readonly string[]).includes(inv.status)) return { status: inv.status, notifIds: [] };

  const { result, hasAuthorized, authorizedRows } = await evaluateInvoice(tx, invoiceId);
  const authorizedKeys = new Set(authorizedRows.map((d) => diffKey(d.code, d.orderItemId)));

  // Reemplaza diferencias no autorizadas; las autorizadas se conservan como evidencia.
  await tx.delete(invoiceDifferences).where(and(eq(invoiceDifferences.invoiceId, invoiceId), isNull(invoiceDifferences.authorizedAt)));
  const fresh = result.differences.filter((d) => !authorizedKeys.has(diffKey(d.code, d.orderItemId)));
  if (fresh.length) {
    await tx.insert(invoiceDifferences).values(fresh.map((d) => ({
      invoiceId, code: d.code, severity: d.severity, orderItemId: d.orderItemId, message: d.message,
      expected: d.expected ?? null, actual: d.actual ?? null, requiresAuthorization: d.requiresAuthorization,
    })));
  }

  let newStatus: (typeof invoices.$inferSelect)["status"];
  let blockedReason: string | null = null;
  switch (result.outcome) {
    case "CONCILIADA": newStatus = "LISTA_PARA_PAGO"; break;
    case "BLOQUEADA": newStatus = "BLOQUEADA"; blockedReason = result.differences.find((d) => d.severity === "BLOQUEO")?.message ?? null; break;
    case "CON_DIFERENCIA": newStatus = hasAuthorized ? "EN_VALIDACION" : "CON_DIFERENCIA"; break;
    default: newStatus = "CARGADA";
  }

  const changed = newStatus !== inv.status;
  if (changed) {
    await tx.update(invoices).set({
      status: newStatus, blockedReason, updatedAt: new Date(), updatedBy: session?.userId ?? null, changeReason: comment ?? "Conciliación automática",
      reconciledAt: newStatus === "LISTA_PARA_PAGO" ? new Date() : null,
    }).where(eq(invoices.id, invoiceId));
    await audit(tx, session, {
      table: "invoices", recordId: invoiceId, action: result.outcome === "CONCILIADA" ? "CONCILIAR" : "CAMBIO_ESTATUS_FACTURA",
      oldData: { status: inv.status }, newData: { status: newStatus, diferencias: result.differences.map((d) => d.code) }, comment: comment ?? "Conciliación automática de OC, recepción y factura",
      origin: session ? "web" : "sistema",
    });
  }

  // Notificaciones solo cuando cambia el estado (evita spam en re-evaluaciones)
  const notifs: NotifyInput[] = [];
  if (changed && ["CON_DIFERENCIA", "BLOQUEADA", "LISTA_PARA_PAGO"].includes(newStatus)) {
    const [order] = await tx.select({ folio: purchaseOrders.folio }).from(purchaseOrders).where(eq(purchaseOrders.id, inv.orderId));
    const target: RoleCode[] = newStatus === "LISTA_PARA_PAGO" ? ["FINANZAS", "COMPRAS"] : ["COMPRAS", "FINANZAS"];
    for (const r of await recipientsByRole(tx, target)) {
      notifs.push({
        userId: r.id, toEmail: r.email, entityType: "invoices", entityId: invoiceId, linkPath: `/facturas/${invoiceId}`,
        type: newStatus === "LISTA_PARA_PAGO" ? "FACTURA_CONCILIADA" : "FACTURA_DIFERENCIA",
        subject: newStatus === "LISTA_PARA_PAGO" ? `Factura conciliada y lista para pago — ${order?.folio}` : `Factura ${newStatus === "BLOQUEADA" ? "bloqueada" : "con diferencias"} — ${order?.folio}`,
        body: newStatus === "LISTA_PARA_PAGO" ? `La factura ${inv.invoiceNumber} de la orden ${order?.folio} coincide con la orden y la recepción aceptada. Está lista para autorización de pago.`
          : `La factura ${inv.invoiceNumber} de la orden ${order?.folio} requiere atención:\n${result.differences.filter((d) => d.severity !== "AVISO").map((d) => `• ${d.message}`).join("\n")}`,
      });
    }
  }
  const notifIds = await enqueue(tx, notifs);
  return { status: newStatus, notifIds };
}
