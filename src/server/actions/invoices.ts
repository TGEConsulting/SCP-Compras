"use server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs, invoiceDifferences, invoiceItems, invoices, products, purchaseOrderItems, purchaseOrders, receipts, suppliers, unitsOfMeasure,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { CfdiError, parseCfdi } from "@/lib/domain/cfdi";
import { enqueue, flushSafely } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { discardBlobs, recordAttachment, uploadPrivate, type StoredBlob } from "@/lib/storage";
import { authorizeDifferenceSchema, rejectInvoiceSchema, uploadInvoiceSchema } from "@/lib/validators";
import { BusinessError, defineAction } from "../action";
import { recipientsByRole, runReconciliation, supplierRecipients } from "../services/invoice-service";
import { assertSupplierEligible } from "../services/supplier-rules";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Carga de factura por el PROVEEDOR (PDF + XML CFDI).
 * Defensa en profundidad contra duplicados: pre-chequeo amable + índices UNIQUE en BD (UUID, folio por proveedor,
 * una factura vigente por proveedor-orden). Si dos cargas llegan a la vez, la BD rechaza la segunda (23505).
 */
export const uploadInvoice = defineAction({ permission: "proveedor:portal", schema: uploadInvoiceSchema }, async ({ input, session, files }) => {
  const pdf = files["pdf"]?.[0], xml = files["xml"]?.[0];
  if (!pdf) throw new BusinessError("Falta el archivo PDF de la factura.");
  if (!xml) throw new BusinessError("Falta el archivo XML (CFDI) de la factura.");
  if (!session.supplierId) throw new BusinessError("Tu usuario no está ligado a un proveedor.");

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId));
  if (!po || po.supplierId !== session.supplierId) throw new BusinessError("Orden no encontrada."); // aislamiento por proveedor
  if (!["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA_TOTAL"].includes(po.status)) throw new BusinessError("Confirma la orden antes de cargar la factura.");
  const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId));
  assertSupplierEligible(sup!);

  const s = await getSettings(db, ["empresa.rfc", "factura.max_archivo_mb"]);
  const max = Number(s["factura.max_archivo_mb"]);
  const pdfBlob = await uploadPrivate(pdf, "pdf", `facturas/${po.id}`, max);
  const xmlBlob = await uploadPrivate(xml, "xml", `facturas/${po.id}`, max).catch(async (e) => { await discardBlobs([pdfBlob]); throw e; });
  const stored: StoredBlob[] = [pdfBlob, xmlBlob];

  const notifIds: string[] = [];
  try {
    let cfdi;
    try { cfdi = parseCfdi(xmlBlob.buffer.toString("utf8")); } catch (e) { if (e instanceof CfdiError) throw new BusinessError(e.message); throw e; }
    if (cfdi.issuerRfc !== sup!.rfc.toUpperCase()) throw new BusinessError("El RFC emisor del CFDI no coincide con el de tu empresa registrada.");
    if (s["empresa.rfc"] && cfdi.receiverRfc !== String(s["empresa.rfc"]).toUpperCase()) throw new BusinessError("El RFC receptor del CFDI no es el de Productos Lácteos La Quinta.");
    if (cfdi.currency !== po.currency) throw new BusinessError(`La moneda del CFDI (${cfdi.currency}) no coincide con la de la orden (${po.currency}).`);

    const invoiceId = await db.transaction(async (tx) => {
      await tx.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, po.id)).for("update"); // serializa con recepciones

      // Pre-chequeo de duplicados con mensaje claro (la BD sigue siendo la garantía final)
      const [dupUuid] = await tx.select({ id: invoices.id, orderId: invoices.orderId }).from(invoices).where(eq(invoices.uuidCfdi, cfdi.uuid)).limit(1);
      if (dupUuid) throw new DuplicateInvoice(`Esta factura (UUID ${cfdi.uuid}) ya fue registrada${dupUuid.orderId !== po.id ? " para otra orden de compra" : ""}.`, cfdi.uuid);
      const [active] = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.orderId, po.id), ne(invoices.status, "RECHAZADA"))).limit(1);
      if (active) throw new DuplicateInvoice("Esta orden ya tiene una factura registrada. Si necesitas corregirla, solicita a Compras que la rechace.", cfdi.uuid);

      const orderLines = await tx.select({
        id: purchaseOrderItems.id, sku: products.sku, description: purchaseOrderItems.description,
      }).from(purchaseOrderItems).innerJoin(products, eq(products.id, purchaseOrderItems.productId)).where(eq(purchaseOrderItems.orderId, po.id));

      const [inv] = await tx.insert(invoices).values({
        orderId: po.id, supplierId: po.supplierId, uuidCfdi: cfdi.uuid, series: cfdi.series, invoiceNumber: cfdi.folio, issuedAt: cfdi.issuedAt,
        issuerRfc: cfdi.issuerRfc, issuerName: cfdi.issuerName, receiverRfc: cfdi.receiverRfc, currency: cfdi.currency,
        subtotal: cfdi.subtotal, taxTotal: cfdi.taxTotal, total: cfdi.total, uploadedBy: session.userId, createdBy: session.userId, updatedBy: session.userId,
      }).returning({ id: invoices.id });

      // Emparejar conceptos ↔ partidas de la OC: primero por NoIdentificacion = SKU, luego por descripción
      const used = new Set<string>();
      const uoms = await tx.select({ code: unitsOfMeasure.code, sat: unitsOfMeasure.satKey }).from(unitsOfMeasure);
      const codeBySat = new Map(uoms.filter((u) => u.sat).map((u) => [u.sat!.toUpperCase(), u.code]));
      await tx.insert(invoiceItems).values(cfdi.concepts.map((k) => {
        const match = orderLines.find((l) => !used.has(l.id) && k.productKey && l.sku.toLowerCase() === k.productKey.toLowerCase())
          ?? orderLines.find((l) => !used.has(l.id) && norm(l.description) === norm(k.description));
        if (match) used.add(match.id);
        // La unidad se normaliza al código interno vía ClaveUnidad SAT cuando existe
        const uom = (k.satUnit && codeBySat.get(k.satUnit.toUpperCase())) || k.uomCode;
        return { invoiceId: inv!.id, orderItemId: match?.id ?? null, productKey: k.productKey, description: k.description, uomCode: uom, quantity: k.quantity, unitPrice: k.unitPrice, subtotal: k.subtotal, taxAmount: k.taxAmount };
      }));

      const pdfId = await recordAttachment(tx, pdfBlob, { ownerType: "invoices", ownerId: inv!.id, kind: "FACTURA_PDF", supplierId: po.supplierId, uploadedBy: session.userId });
      const xmlId = await recordAttachment(tx, xmlBlob, { ownerType: "invoices", ownerId: inv!.id, kind: "FACTURA_XML", supplierId: po.supplierId, uploadedBy: session.userId });
      await tx.update(invoices).set({ pdfAttachmentId: pdfId, xmlAttachmentId: xmlId }).where(eq(invoices.id, inv!.id));
      // Las recepciones que esperaban factura dejan de estar pendientes
      await tx.update(receipts).set({ status: "COMPLETADA", updatedAt: new Date(), changeReason: "Factura cargada por el proveedor" }).where(and(eq(receipts.orderId, po.id), eq(receipts.status, "PENDIENTE_FACTURA")));
      await audit(tx, session, { table: "invoices", recordId: inv!.id, action: "CARGAR_FACTURA", newData: { uuid: cfdi.uuid, folio: cfdi.folio, total: cfdi.total, orden: po.folio } });

      const r = await runReconciliation(tx, session, inv!.id, "Conciliación automática al cargar la factura");
      notifIds.push(...r.notifIds);
      notifIds.push(...await enqueue(tx, (await recipientsByRole(tx, ["COMPRAS", "CALIDAD", "ALMACEN"])).map((u) => ({
        userId: u.id, toEmail: u.email, type: "FACTURA_CARGADA", entityType: "invoices", entityId: inv!.id, linkPath: `/facturas/${inv!.id}`,
        subject: `Factura cargada — ${po.folio}`, body: `${sup!.legalName} cargó la factura ${cfdi.folio} por $${cfdi.total} para la orden ${po.folio}.`,
      }))));
      return inv!.id;
    });
    await flushSafely(notifIds);
    return { data: { id: invoiceId }, message: "Factura cargada. El sistema la está conciliando con la recepción." };
  } catch (e) {
    await discardBlobs(stored);
    if (e instanceof DuplicateInvoice) {
      // Se deja constancia del intento (fuera de la transacción revertida)
      await db.insert(auditLogs).values({ userId: session.userId, userName: session.name, roles: session.roles, tableName: "invoices", recordId: null, action: "FACTURA_DUPLICADA_BLOQUEADA", newData: { uuid: e.uuid, orderId: po.id }, comment: e.message, origin: "web" });
      throw new BusinessError(e.message);
    }
    throw e;
  }
});

class DuplicateInvoice extends Error { constructor(message: string, public uuid: string) { super(message); } }

/** Compras/Finanzas autorizan UNA diferencia autorizable (p. ej. precio fuera de tolerancia) con motivo obligatorio. */
export const authorizeDifference = defineAction({ permission: "factura:autorizar_diferencia", schema: authorizeDifferenceSchema }, async ({ input, session }) => {
  const notifIds: string[] = [];
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(invoiceDifferences).where(eq(invoiceDifferences.id, input.differenceId));
    if (!d) throw new BusinessError("Diferencia no encontrada.");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, d.invoiceId));
    await tx.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, inv!.orderId)).for("update");
    if (!["CON_DIFERENCIA", "EN_VALIDACION"].includes(inv!.status)) throw new BusinessError("La factura no está pendiente de autorización de diferencias.");
    if (!d.requiresAuthorization || d.severity !== "DIFERENCIA") throw new BusinessError("Esta diferencia no es autorizable; la factura debe corregirse o rechazarse.");
    if (d.authorizedAt) throw new BusinessError("Esta diferencia ya fue autorizada.");
    await tx.update(invoiceDifferences).set({ authorizedBy: session.userId, authorizedAt: new Date(), authorizationReason: input.reason }).where(eq(invoiceDifferences.id, d.id));
    await audit(tx, session, { table: "invoice_differences", recordId: d.id, action: "AUTORIZAR_DIFERENCIA", newData: { code: d.code, esperado: d.expected, facturado: d.actual }, comment: input.reason });
    const r = await runReconciliation(tx, session, inv!.id, `Diferencia autorizada: ${d.code}`);
    notifIds.push(...r.notifIds);
  });
  await flushSafely(notifIds);
  return { data: undefined, message: "Diferencia autorizada y factura re-evaluada." };
});

/** Rechaza la factura (queda en historial) para que el proveedor cargue una corregida. No si ya hay pago vigente. */
export const rejectInvoice = defineAction({ permission: "factura:autorizar_diferencia", schema: rejectInvoiceSchema }, async ({ input, session }) => {
  const notifIds: string[] = [];
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update");
    if (!inv) throw new BusinessError("Factura no encontrada.");
    if (["PAGADA", "RECHAZADA", "LISTA_PARA_PAGO"].includes(inv.status)) throw new BusinessError("Esta factura ya no puede rechazarse en su estado actual.");
    await tx.update(invoices).set({ status: "RECHAZADA", blockedReason: input.reason, updatedAt: new Date(), updatedBy: session.userId, changeReason: input.reason }).where(eq(invoices.id, inv.id));
    await audit(tx, session, { table: "invoices", recordId: inv.id, action: "RECHAZAR_FACTURA", oldData: { status: inv.status }, newData: { status: "RECHAZADA" }, comment: input.reason });
    const [po] = await tx.select({ folio: purchaseOrders.folio }).from(purchaseOrders).where(eq(purchaseOrders.id, inv.orderId));
    notifIds.push(...await enqueue(tx, (await supplierRecipients(tx, inv.supplierId)).map((r) => ({
      userId: r.userId, supplierId: inv.supplierId, toEmail: r.email, type: "FACTURA_RECHAZADA", entityType: "invoices", entityId: inv.id, linkPath: `/proveedor/ordenes/${inv.orderId}`,
      subject: `Factura rechazada — ${po?.folio}`, body: `Tu factura ${inv.invoiceNumber} fue rechazada.\nMotivo: ${input.reason}\nPuedes cargar una factura corregida desde el portal.`,
    }))));
  });
  await flushSafely(notifIds);
  return { data: undefined, message: "Factura rechazada; se notificó al proveedor." };
});
