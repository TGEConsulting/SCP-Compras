"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, purchaseOrders } from "@/db/schema";
import { audit } from "@/lib/audit";
import { enqueue, flushSafely } from "@/lib/notify";
import { discardBlobs, recordAttachment, uploadPrivate, type StoredBlob } from "@/lib/storage";
import { authorizePaymentSchema, registerPaymentSchema } from "@/lib/validators";
import { BusinessError, defineAction } from "../action";
import { evaluateInvoice, supplierRecipients } from "../services/invoice-service";

/**
 * SOLO Finanzas. No confía en el estatus guardado: RE-EJECUTA la conciliación en el momento de autorizar y exige
 * recepción aceptada + factura conciliada. Es la última barrera del "pago bloqueado".
 */
export const authorizePayment = defineAction({ permission: "pago:autorizar", schema: authorizePaymentSchema }, async ({ input, session }) => {
  await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update");
    if (!inv) throw new BusinessError("Factura no encontrada.");
    await tx.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, inv.orderId)).for("update");
    if (inv.status !== "LISTA_PARA_PAGO") throw new BusinessError("El pago está bloqueado: la factura no está conciliada y lista para pago.");

    const { result } = await evaluateInvoice(tx, inv.id);
    if (result.outcome !== "CONCILIADA") throw new BusinessError("El pago está bloqueado: la validación actual de la factura ya no cuadra con la recepción aceptada. Revisa la conciliación.");
    if (Number(result.payableTotal) <= 0) throw new BusinessError("No hay mercancía aceptada que pagar.");

    await tx.insert(payments).values({ invoiceId: inv.id, supplierId: inv.supplierId, amount: inv.total, authorizedBy: session.userId, createdBy: session.userId, updatedBy: session.userId });
    await audit(tx, session, { table: "payments", recordId: inv.id, action: "AUTORIZAR_PAGO", newData: { factura: inv.invoiceNumber, monto: inv.total } });
  });
  return { data: undefined, message: "Pago autorizado." };
});

export const registerPayment = defineAction({ permission: "pago:registrar", schema: registerPaymentSchema }, async ({ input, session, files }) => {
  const proof = files["comprobante"]?.[0];
  const stored: StoredBlob[] = [];
  const notifIds: string[] = [];
  try {
    const blob = proof ? await uploadPrivate(proof, "doc", `pagos/${input.paymentId}`) : null;
    if (blob) stored.push(blob);
    await db.transaction(async (tx) => {
      const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
      if (!p) throw new BusinessError("Pago no encontrado.");
      if (p.status !== "AUTORIZADO") throw new BusinessError("Este pago ya fue registrado o cancelado.");
      const proofId = blob ? await recordAttachment(tx, blob, { ownerType: "payments", ownerId: p.id, kind: "COMPROBANTE_PAGO", supplierId: p.supplierId, uploadedBy: session.userId }) : null;
      await tx.update(payments).set({
        status: "PAGADO", paidBy: session.userId, paidAt: new Date(), paymentDate: input.paymentDate, reference: input.reference, proofAttachmentId: proofId, updatedAt: new Date(), updatedBy: session.userId,
      }).where(eq(payments.id, p.id));
      await tx.update(invoices).set({ status: "PAGADA", updatedAt: new Date(), updatedBy: session.userId, changeReason: `Pago ${input.reference}` }).where(eq(invoices.id, p.invoiceId));
      await audit(tx, session, { table: "payments", recordId: p.id, action: "REGISTRAR_PAGO", newData: { referencia: input.reference, fecha: input.paymentDate, monto: p.amount } });
      notifIds.push(...await enqueue(tx, (await supplierRecipients(tx, p.supplierId)).map((r) => ({
        userId: r.userId, supplierId: p.supplierId, toEmail: r.email, type: "PAGO_REGISTRADO", entityType: "payments", entityId: p.id, linkPath: "/proveedor",
        subject: "Pago registrado", body: `Se registró el pago de tu factura por $${p.amount} MXN. Referencia: ${input.reference}.`,
      }))));
    });
    await flushSafely(notifIds);
    return { data: undefined, message: "Pago registrado." };
  } catch (e) { await discardBlobs(stored); throw e; }
});
