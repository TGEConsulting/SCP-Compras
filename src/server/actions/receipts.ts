"use server";
import Decimal from "decimal.js";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { products, purchaseOrderItems, purchaseOrders, receiptItems, receipts, suppliers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { enqueue, flushSafely } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { discardBlobs, recordAttachment, uploadPrivate, type StoredBlob } from "@/lib/storage";
import { registerReceiptSchema } from "@/lib/validators";
import { BusinessError, defineAction } from "../action";
import { activeInvoiceFor, getInvoiceIndicator, MISSING_INVOICE_WARNING, recipientsByRole, runReconciliation, supplierRecipients } from "../services/invoice-service";

const RECEIVABLE = ["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"];

/**
 * Registro de recepción + inspección de calidad, en UNA transacción.
 *  - Bloquea la fila de la OC (FOR UPDATE): serializa recepciones y cargas de factura de la misma orden (sin carreras).
 *  - Consulta el estatus de factura EN SERVIDOR (no confía en lo que mostró la pantalla).
 *  - Sin factura → recepción PENDIENTE_FACTURA (pago bloqueado). Con factura → COMPLETADA y se reconcilia.
 */
export const registerReceipt = defineAction({ permission: "recepcion:registrar", schema: registerReceiptSchema }, async ({ input, session, files }) => {
  // 1) Fotos primero (fuera de la transacción). Si algo falla después, se descartan.
  const photos = new Map<string, StoredBlob[]>();
  const stored: StoredBlob[] = [];
  for (const it of input.items) {
    for (const f of files[`foto:${it.orderItemId}`] ?? []) {
      const b = await uploadPrivate(f, "image", `recepciones/${input.orderId}`);
      stored.push(b); photos.set(it.orderItemId, [...(photos.get(it.orderItemId) ?? []), b]);
    }
  }

  const notifIds: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId)).for("update");
      if (!po) throw new BusinessError("Orden no encontrada.");
      if (!RECEIVABLE.includes(po.status)) throw new BusinessError("La orden debe estar confirmada por el proveedor para registrar recepciones.");

      const lines = await tx.select({
        id: purchaseOrderItems.id, quantity: purchaseOrderItems.quantity, description: purchaseOrderItems.description,
        coldChain: products.requiresColdChain, maxTemp: products.maxArrivalTempC, needsExpiry: products.requiresExpiryDate,
      }).from(purchaseOrderItems).innerJoin(products, eq(products.id, purchaseOrderItems.productId)).where(eq(purchaseOrderItems.orderId, po.id));
      const lineById = new Map(lines.map((l) => [l.id, l]));
      const prev = await tx.select({ orderItemId: receiptItems.orderItemId, received: receiptItems.quantityReceived, accepted: receiptItems.quantityAccepted })
        .from(receiptItems).innerJoin(receipts, eq(receipts.id, receiptItems.receiptId)).where(and(eq(receipts.orderId, po.id), ne(receipts.status, "CANCELADA")));
      const prevAccepted = new Map<string, Decimal>();
      for (const p of prev) {
        prevAccepted.set(p.orderItemId, (prevAccepted.get(p.orderItemId) ?? new Decimal(0)).plus(p.accepted));
      }
      const s = await getSettings(tx, ["recepcion.sobreentrega_pct"]);
      const today = new Date().toISOString().slice(0, 10);

      const rows: (typeof receiptItems.$inferInsert)[] = [];
      const rejectedLines: string[] = [];
      for (const it of input.items) {
        const line = lineById.get(it.orderItemId);
        if (!line) throw new BusinessError("Una partida no pertenece a esta orden.");
        const rec = new Decimal(it.received), acc = new Decimal(it.accepted), rej = new Decimal(it.rejected);
        if (rec.isZero()) continue; // partida sin recepción en esta entrega
        const name = line.description;
        if (!rec.eq(acc.plus(rej))) throw new BusinessError(`«${name}»: la cantidad recibida debe ser igual a aceptada + rechazada.`);
        const limit = new Decimal(line.quantity).times(1 + Number(s["recepcion.sobreentrega_pct"]) / 100);
        // Lo rechazado no consume la cantidad ordenada (el proveedor debe reponerlo): el tope se mide contra lo ACEPTADO.
        if ((prevAccepted.get(line.id) ?? new Decimal(0)).plus(rec).gt(limit)) throw new BusinessError(`«${name}»: se excede la cantidad ordenada (${line.quantity}).`);
        if (!it.supplierLot) throw new BusinessError(`«${name}»: captura el lote del proveedor.`);
        if (line.needsExpiry && !it.expiryDate) throw new BusinessError(`«${name}»: captura la fecha de caducidad o consumo preferente.`);
        if (it.expiryDate && it.expiryDate <= today && acc.gt(0)) throw new BusinessError(`«${name}»: el producto está caducado; no puede aceptarse.`);
        if (line.coldChain) {
          if (it.arrivalTempC === undefined) throw new BusinessError(`«${name}»: captura la temperatura de llegada (cadena fría).`);
          if (line.maxTemp !== null && new Decimal(it.arrivalTempC).gt(line.maxTemp) && it.inspectionResult === "CONFORME")
            throw new BusinessError(`«${name}»: ${it.arrivalTempC} °C excede el máximo de ${line.maxTemp} °C; no puede marcarse como conforme.`);
        }
        if (!it.packagingCondition) throw new BusinessError(`«${name}»: indica la condición del empaque.`);
        if (rej.gt(0)) {
          if (!it.rejectionReason) throw new BusinessError(`«${name}»: indica el motivo del rechazo.`);
          if (!it.correctiveAction) throw new BusinessError(`«${name}»: indica la acción correctiva solicitada.`);
          if (!(photos.get(line.id)?.length)) throw new BusinessError(`«${name}»: las evidencias fotográficas son obligatorias en rechazos.`);
          if (it.inspectionResult === "CONFORME") throw new BusinessError(`«${name}»: con cantidad rechazada el resultado no puede ser «Conforme».`);
          rejectedLines.push(`${name}: ${rej.toString()} rechazadas — ${it.rejectionReason}`);
        }
        if (it.inspectionResult === "RECHAZADO" && acc.gt(0)) throw new BusinessError(`«${name}»: un resultado «Rechazado» no puede tener cantidad aceptada.`);
        rows.push({
          receiptId: "", orderItemId: line.id, quantityOrdered: line.quantity, quantityReceived: it.received, quantityAccepted: it.accepted, quantityRejected: it.rejected,
          supplierLot: it.supplierLot, expiryDate: it.expiryDate ?? null, arrivalTempC: it.arrivalTempC ?? null, packagingCondition: it.packagingCondition,
          inspectionResult: it.inspectionResult, rejectionReason: it.rejectionReason ?? null, correctiveAction: it.correctiveAction ?? null, observations: it.observations ?? null,
        });
        prevAccepted.set(line.id, (prevAccepted.get(line.id) ?? new Decimal(0)).plus(acc));
      }
      if (!rows.length) throw new BusinessError("Captura al menos una partida con cantidad recibida.");

      // 2) Estatus de factura consultado en servidor, dentro del bloqueo de la OC
      const indicator = await getInvoiceIndicator(tx, po.id);
      if (input.mode === "FINALIZAR" && indicator.state === "NO_CARGADA") throw new BusinessError(MISSING_INVOICE_WARNING + " Usa «Guardar como pendiente de factura».");
      const status = indicator.state === "NO_CARGADA" ? "PENDIENTE_FACTURA" : "COMPLETADA";

      const [rc] = await tx.insert(receipts).values({
        orderId: po.id, status, trackingNumber: input.trackingNumber ?? po.trackingNumber, supplierDeliveryNote: input.supplierDeliveryNote ?? null,
        receivedBy: session.userId, invoiceStatusAtReceipt: indicator.state, observations: input.observations ?? null, createdBy: session.userId, updatedBy: session.userId,
      }).returning({ id: receipts.id, folio: receipts.folio });
      const inserted = await tx.insert(receiptItems).values(rows.map((r) => ({ ...r, receiptId: rc!.id }))).returning({ id: receiptItems.id, orderItemId: receiptItems.orderItemId });
      for (const ri of inserted) for (const b of photos.get(ri.orderItemId) ?? [])
        await recordAttachment(tx, b, { ownerType: "receipt_items", ownerId: ri.id, kind: "EVIDENCIA_FOTO", supplierId: po.supplierId, uploadedBy: session.userId });

      await audit(tx, session, { table: "receipts", recordId: rc!.id, action: "RECIBIR_MERCANCIA", newData: { folio: rc!.folio, orden: po.folio, status, facturaAlRecibir: indicator.state, partidas: rows.length } });
      for (const r of rows.filter((x) => new Decimal(x.quantityRejected as string).gt(0)))
        await audit(tx, session, { table: "receipt_items", recordId: null, action: "RECHAZAR_PRODUCTO", newData: { orderItemId: r.orderItemId, rechazado: r.quantityRejected, motivo: r.rejectionReason, accion: r.correctiveAction }, comment: r.rejectionReason });

      // 3) Estatus de la orden: total solo si TODO lo ordenado quedó ACEPTADO
      const full = lines.every((l) => (prevAccepted.get(l.id) ?? new Decimal(0)).gte(l.quantity));
      await tx.update(purchaseOrders).set({ status: full ? "RECIBIDA_TOTAL" : "RECIBIDA_PARCIAL", updatedAt: new Date(), updatedBy: session.userId }).where(eq(purchaseOrders.id, po.id));

      // 4) Si ya hay factura: re-conciliar con la nueva recepción
      let invoiceStatus: string | null = null;
      const inv = await activeInvoiceFor(tx, po.id);
      if (inv) {
        const r = await runReconciliation(tx, session, inv.id, `Recepción ${rc!.folio}`);
        invoiceStatus = r.status; notifIds.push(...r.notifIds);
      }

      // 5) Notificaciones
      const [sup] = await tx.select({ name: suppliers.legalName }).from(suppliers).where(eq(suppliers.id, po.supplierId));
      const buyers = await recipientsByRole(tx, ["COMPRAS"]);
      if (status === "PENDIENTE_FACTURA") {
        const to = [...buyers.map((b) => ({ userId: b.id, supplierId: null as string | null, email: b.email })), ...(await supplierRecipients(tx, po.supplierId)).map((r) => ({ userId: r.userId, supplierId: po.supplierId, email: r.email }))];
        notifIds.push(...await enqueue(tx, to.map((r) => ({
          userId: r.userId, supplierId: r.supplierId, toEmail: r.email, type: "RECEPCION_SIN_FACTURA", entityType: "receipts", entityId: rc!.id, linkPath: r.supplierId ? `/proveedor/ordenes/${po.id}` : `/ordenes/${po.id}`,
          subject: `Recepción registrada sin factura — ${po.folio}`, body: `Se recibió mercancía de la orden ${po.folio} (${sup?.name}) y la factura aún no está cargada. El pago permanecerá bloqueado hasta que el proveedor la cargue y se concilie.`,
        }))));
      }
      if (rejectedLines.length) {
        const qa = await recipientsByRole(tx, ["CALIDAD", "COMPRAS"]);
        const sr = await supplierRecipients(tx, po.supplierId);
        notifIds.push(...await enqueue(tx, [...qa.map((u) => ({ userId: u.id, supplierId: null as string | null, email: u.email })), ...sr.map((r) => ({ userId: r.userId, supplierId: po.supplierId, email: r.email }))].map((r) => ({
          userId: r.userId, supplierId: r.supplierId, toEmail: r.email, type: "PRODUCTO_RECHAZADO", entityType: "receipts", entityId: rc!.id, linkPath: r.supplierId ? `/proveedor/ordenes/${po.id}` : `/ordenes/${po.id}`,
          subject: `Producto rechazado por calidad — ${po.folio}`, body: rejectedLines.join("\n"),
        }))));
      }
      return { id: rc!.id, folio: rc!.folio, status, invoiceStatus, poId: po.id };
    });
    await flushSafely(notifIds);
    return {
      data: result,
      message: result.status === "PENDIENTE_FACTURA" ? `Recepción ${result.folio} guardada como PENDIENTE_FACTURA. El pago permanece bloqueado.` : `Recepción ${result.folio} finalizada.`,
      redirectTo: `/ordenes/${result.poId}`,
    };
  } catch (e) {
    await discardBlobs(stored); // compensación: no dejar fotos huérfanas
    throw e;
  }
});
