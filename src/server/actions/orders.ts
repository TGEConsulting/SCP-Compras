"use server";
import Decimal from "decimal.js";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { invoices, products, purchaseOrderItems, purchaseOrders, purchaseRequestItems, purchaseRequests, receipts, suppliers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { enqueue, flushSafely } from "@/lib/notify";
import { discardBlobs, recordAttachment, uploadPrivate, type StoredBlob } from "@/lib/storage";
import { cancelOrderSchema, confirmOrderSchema, createOrderSchema, uploadOrderDocSchema } from "@/lib/validators";
import { BusinessError, defineAction } from "../action";
import { recipientsByRole, supplierRecipients } from "../services/invoice-service";
import { assertSupplierEligible } from "../services/supplier-rules";

export const createOrder = defineAction({ permission: "oc:crear", schema: createOrderSchema }, async ({ input, session }) => {
  const id = await db.transaction(async (tx) => {
    // Bloqueo de la solicitud: dos compradores no pueden generar dos OC de la misma solicitud.
    const [req] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, input.requestId)).for("update");
    if (!req) throw new BusinessError("Solicitud no encontrada.");
    if (req.status !== "APROBADA") throw new BusinessError("Solo se puede generar una orden de una solicitud aprobada que no tenga orden.");

    const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
    if (!sup) throw new BusinessError("Proveedor no encontrado.");
    assertSupplierEligible(sup);

    const reqItems = await tx.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, req.id));
    const byId = new Map(reqItems.map((i) => [i.id, i]));
    if (input.lines.length !== reqItems.length || input.lines.some((l) => !byId.has(l.requestItemId)))
      throw new BusinessError("La orden debe incluir todas las partidas de la solicitud.");
    const prods = await tx.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, reqItems.map((i) => i.productId)));
    const nameOf = new Map(prods.map((p) => [p.id, p.name]));

    let subtotal = new Decimal(0), tax = new Decimal(0);
    const lines = input.lines.map((l) => {
      const ri = byId.get(l.requestItemId)!; // cantidad y unidad vienen de la solicitud aprobada, no del cliente
      const sub = new Decimal(ri.quantity).times(l.unitPrice).toDecimalPlaces(2);
      subtotal = subtotal.plus(sub); tax = tax.plus(sub.times(l.taxRate).toDecimalPlaces(2));
      return { ri, l, sub };
    });

    const [po] = await tx.insert(purchaseOrders).values({
      requestId: req.id, supplierId: sup.id, subtotal: subtotal.toFixed(2), taxTotal: tax.toFixed(2), total: subtotal.plus(tax).toFixed(2),
      paymentTerms: input.paymentTerms ?? null, deliveryAddress: input.deliveryAddress ?? null, notes: input.notes ?? null, createdBy: session.userId, updatedBy: session.userId,
    }).returning({ id: purchaseOrders.id, folio: purchaseOrders.folio });
    await tx.insert(purchaseOrderItems).values(lines.map(({ ri, l, sub }) => ({
      orderId: po!.id, requestItemId: ri.id, productId: ri.productId, description: ri.description || nameOf.get(ri.productId) || "Producto",
      uomId: ri.uomId, quantity: ri.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, lineSubtotal: sub.toFixed(2),
    })));
    await tx.update(purchaseRequests).set({ status: "OC_GENERADA", updatedAt: new Date(), updatedBy: session.userId, changeReason: `OC ${po!.folio}` }).where(eq(purchaseRequests.id, req.id));
    await audit(tx, session, { table: "purchase_orders", recordId: po!.id, action: "CREAR_OC", newData: { folio: po!.folio, requestId: req.id, supplierId: sup.id, total: subtotal.plus(tax).toFixed(2) } });
    return po!.id;
  });
  return { data: { id }, message: "Orden de compra generada.", redirectTo: `/ordenes/${id}` };
});

/** Envía la OC al proveedor: cambia estatus (portal) y encola el correo. Idempotente: solo desde OC_GENERADA. */
export const sendOrder = defineAction({ permission: "oc:enviar", schema: z.object({ orderId: z.string().uuid() }) }, async ({ input, session }) => {
  const notifIds: string[] = [];
  await db.transaction(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId)).for("update");
    if (!po) throw new BusinessError("Orden no encontrada.");
    if (po.status !== "OC_GENERADA") throw new BusinessError("La orden ya fue enviada o no puede enviarse en su estado actual.");
    const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, po.supplierId));
    assertSupplierEligible(sup!);
    await tx.update(purchaseOrders).set({ status: "ENVIADA_PROVEEDOR", sentAt: new Date(), updatedAt: new Date(), updatedBy: session.userId }).where(eq(purchaseOrders.id, po.id));
    await audit(tx, session, { table: "purchase_orders", recordId: po.id, action: "ENVIAR_PROVEEDOR", oldData: { status: po.status }, newData: { status: "ENVIADA_PROVEEDOR" } });
    notifIds.push(...await enqueue(tx, (await supplierRecipients(tx, po.supplierId)).map((r) => ({
      userId: r.userId, supplierId: po.supplierId, toEmail: r.email, type: "OC_ENVIADA", entityType: "purchase_orders", entityId: po.id, linkPath: `/proveedor/ordenes/${po.id}`,
      subject: `Nueva orden de compra ${po.folio}`, body: `Productos Lácteos La Quinta te envió la orden ${po.folio} por $${po.total} MXN. Confírmala e indica tu fecha compromiso en el portal.`,
    }))));
  });
  await flushSafely(notifIds);
  return { data: undefined, message: "Orden enviada al proveedor." };
});

/** El proveedor confirma SU orden y fija fecha compromiso. */
export const confirmOrder = defineAction({ permission: "proveedor:portal", schema: confirmOrderSchema }, async ({ input, session }) => {
  if (input.promisedDate < new Date().toISOString().slice(0, 10)) throw new BusinessError("La fecha compromiso no puede ser anterior a hoy.");
  const notifIds: string[] = [];
  await db.transaction(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId)).for("update");
    if (!po || po.supplierId !== session.supplierId) throw new BusinessError("Orden no encontrada."); // sin revelar si existe
    if (po.status !== "ENVIADA_PROVEEDOR") throw new BusinessError("Esta orden ya fue confirmada o no está disponible para confirmar.");
    await tx.update(purchaseOrders).set({ status: "CONFIRMADA", confirmedAt: new Date(), promisedDate: input.promisedDate, trackingNumber: input.trackingNumber ?? po.trackingNumber, updatedAt: new Date(), updatedBy: session.userId }).where(eq(purchaseOrders.id, po.id));
    await audit(tx, session, { table: "purchase_orders", recordId: po.id, action: "CONFIRMAR_PROVEEDOR", oldData: { status: po.status }, newData: { status: "CONFIRMADA", promisedDate: input.promisedDate } });
    notifIds.push(...await enqueue(tx, (await recipientsByRole(tx, ["COMPRAS"])).map((b) => ({
      userId: b.id, toEmail: b.email, type: "OC_CONFIRMADA", entityType: "purchase_orders", entityId: po.id, linkPath: `/ordenes/${po.id}`,
      subject: `Orden ${po.folio} confirmada por el proveedor`, body: `Fecha compromiso: ${input.promisedDate}.`,
    }))));
  });
  await flushSafely(notifIds);
  return { data: undefined, message: "Orden confirmada. ¡Gracias!" };
});

export const markInTransit = defineAction({ permission: "proveedor:portal", schema: z.object({ orderId: z.string().uuid(), trackingNumber: z.string().trim().min(3).max(80) }) }, async ({ input, session }) => {
  await db.transaction(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId)).for("update");
    if (!po || po.supplierId !== session.supplierId) throw new BusinessError("Orden no encontrada.");
    if (!["CONFIRMADA", "EN_TRANSITO"].includes(po.status)) throw new BusinessError("Primero confirma la orden.");
    await tx.update(purchaseOrders).set({ status: "EN_TRANSITO", trackingNumber: input.trackingNumber, updatedAt: new Date(), updatedBy: session.userId }).where(eq(purchaseOrders.id, po.id));
    await audit(tx, session, { table: "purchase_orders", recordId: po.id, action: "EN_TRANSITO", oldData: { status: po.status }, newData: { status: "EN_TRANSITO", guia: input.trackingNumber } });
  });
  return { data: undefined, message: "Envío marcado en tránsito." };
});

/** Remisión, acuse, guía, cotización o ficha técnica del proveedor para su OC. */
export const uploadOrderDocument = defineAction({ permission: "proveedor:portal", schema: uploadOrderDocSchema }, async ({ input, session, files }) => {
  const file = files["file"]?.[0];
  if (!file) throw new BusinessError("Selecciona un archivo.");
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId));
  if (!po || po.supplierId !== session.supplierId) throw new BusinessError("Orden no encontrada.");
  const blob = await uploadPrivate(file, "doc", `ordenes/${po.id}`);
  const stored: StoredBlob[] = [blob];
  try {
    await db.transaction(async (tx) => {
      const aid = await recordAttachment(tx, blob, { ownerType: "purchase_orders", ownerId: po.id, kind: input.kind, supplierId: po.supplierId, uploadedBy: session.userId });
      await audit(tx, session, { table: "attachments", recordId: aid, action: "CARGAR_DOCUMENTO", newData: { kind: input.kind, orden: po.folio, archivo: blob.fileName } });
    });
  } catch (e) { await discardBlobs(stored); throw e; }
  return { data: undefined, message: "Documento cargado." };
});

/** Cancelación con motivo: solo antes de cualquier recepción o factura. Libera la solicitud para generar otra OC. */
export const cancelOrder = defineAction({ permission: "oc:crear", schema: cancelOrderSchema }, async ({ input, session }) => {
  const notifIds: string[] = [];
  await db.transaction(async (tx) => {
    const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId)).for("update");
    if (!po) throw new BusinessError("Orden no encontrada.");
    if (!["OC_GENERADA", "ENVIADA_PROVEEDOR", "CONFIRMADA", "EN_TRANSITO"].includes(po.status)) throw new BusinessError("La orden ya tiene recepciones o está cerrada; no puede cancelarse.");
    const [rc] = await tx.select({ id: receipts.id }).from(receipts).where(eq(receipts.orderId, po.id)).limit(1);
    const [iv] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.orderId, po.id), ne(invoices.status, "RECHAZADA"))).limit(1);
    if (rc || iv) throw new BusinessError("La orden ya tiene recepción o factura; no puede cancelarse.");
    await tx.update(purchaseOrders).set({ status: "CANCELADA", updatedAt: new Date(), updatedBy: session.userId, changeReason: input.reason }).where(eq(purchaseOrders.id, po.id));
    await tx.update(purchaseRequests).set({ status: "APROBADA", updatedAt: new Date(), updatedBy: session.userId, changeReason: `OC ${po.folio} cancelada` }).where(eq(purchaseRequests.id, po.requestId));
    await audit(tx, session, { table: "purchase_orders", recordId: po.id, action: "CANCELAR_OC", oldData: { status: po.status }, newData: { status: "CANCELADA" }, comment: input.reason });
    if (po.status !== "OC_GENERADA") notifIds.push(...await enqueue(tx, (await supplierRecipients(tx, po.supplierId)).map((r) => ({
      userId: r.userId, supplierId: po.supplierId, toEmail: r.email, type: "OC_CANCELADA", entityType: "purchase_orders", entityId: po.id, linkPath: `/proveedor/ordenes/${po.id}`,
      subject: `Orden ${po.folio} cancelada`, body: `La orden fue cancelada. Motivo: ${input.reason}`,
    }))));
  });
  await flushSafely(notifIds);
  return { data: undefined, message: "Orden cancelada." };
});
