"use server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { areas, products, purchaseRequestItems, purchaseRequests, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { enqueue, flushSafely } from "@/lib/notify";
import { decideRequestSchema, saveRequestSchema } from "@/lib/validators";
import { z } from "zod";
import { BusinessError, defineAction } from "../action";
import { recipientsByRole } from "../services/invoice-service";

/** Crear/editar solicitud. Solo el dueño y solo en BORRADOR o DEVUELTA. `submit` la envía al jefe de área. */
export const saveRequest = defineAction({ permission: "solicitud:crear", schema: saveRequestSchema }, async ({ input, session }) => {
  if (!session.areaId || !session.plantId) throw new BusinessError("Tu usuario no tiene área y planta asignadas. Pide al administrador que las configure.");
  const notifIds: string[] = [];

  const out = await db.transaction(async (tx) => {
    // Productos activos y unidad de medida tomada del catálogo (el cliente no decide la unidad)
    const pids = [...new Set(input.items.map((i) => i.productId))];
    const prods = await tx.select({ id: products.id, uomId: products.uomId }).from(products).where(and(inArray(products.id, pids), eq(products.active, true)));
    if (prods.length !== pids.length) throw new BusinessError("Alguno de los productos ya no está activo en el catálogo.");
    const uomOf = new Map(prods.map((p) => [p.id, p.uomId]));

    let id = input.requestId;
    if (id) {
      const [cur] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update");
      if (!cur || cur.requesterId !== session.userId) throw new BusinessError("Solicitud no encontrada.");
      if (!["BORRADOR", "DEVUELTA"].includes(cur.status)) throw new BusinessError("Solo se puede editar una solicitud en borrador o devuelta.");
      await tx.update(purchaseRequests).set({
        title: input.title, justification: input.justification, costCenterId: input.costCenterId ?? null, neededBy: input.neededBy ?? null,
        status: input.submit ? "ENVIADA" : cur.status, updatedAt: new Date(), updatedBy: session.userId,
        changeReason: cur.status === "DEVUELTA" ? "Corrección tras devolución" : "Edición", decisionReason: input.submit ? null : cur.decisionReason,
      }).where(eq(purchaseRequests.id, id));
      await tx.delete(purchaseRequestItems).where(eq(purchaseRequestItems.requestId, id));
      await audit(tx, session, { table: "purchase_requests", recordId: id, action: input.submit ? "REENVIAR" : "EDITAR", oldData: { status: cur.status }, newData: { items: input.items.length } });
    } else {
      const [row] = await tx.insert(purchaseRequests).values({
        requesterId: session.userId, areaId: session.areaId!, plantId: session.plantId!, title: input.title, justification: input.justification,
        costCenterId: input.costCenterId ?? null, neededBy: input.neededBy ?? null, status: input.submit ? "ENVIADA" : "BORRADOR", createdBy: session.userId, updatedBy: session.userId,
      }).returning({ id: purchaseRequests.id });
      id = row!.id;
      await audit(tx, session, { table: "purchase_requests", recordId: id, action: "CREAR_SOLICITUD", newData: { title: input.title, items: input.items.length, enviada: input.submit } });
    }
    await tx.insert(purchaseRequestItems).values(input.items.map((i) => ({
      requestId: id!, productId: i.productId, description: i.description ?? null, quantity: i.quantity, uomId: uomOf.get(i.productId)!, estimatedUnitPrice: i.estimatedUnitPrice ?? null,
    })));

    if (input.submit) {
      const [area] = await tx.select({ head: areas.headUserId }).from(areas).where(eq(areas.id, session.areaId!));
      if (!area?.head) throw new BusinessError("Tu área no tiene jefe asignado; no se puede enviar. Avisa al administrador.");
      const [boss] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, area.head));
      const [req] = await tx.select({ folio: purchaseRequests.folio }).from(purchaseRequests).where(eq(purchaseRequests.id, id!));
      if (boss) notifIds.push(...await enqueue(tx, [{
        userId: boss.id, toEmail: boss.email, type: "SOLICITUD_ENVIADA", entityType: "purchase_requests", entityId: id!, linkPath: `/solicitudes/${id}`,
        subject: `Nueva solicitud por aprobar — ${req?.folio}`, body: `${session.name} envió la solicitud «${input.title}». Revísala para aprobar, rechazar o devolver.`,
      }]));
    }
    return id!;
  });
  await flushSafely(notifIds);
  return { data: { id: out }, message: input.submit ? "Solicitud enviada a tu jefe de área." : "Borrador guardado.", redirectTo: `/solicitudes/${out}` };
});

/** El jefe del ÁREA de la solicitud (no cualquier jefe) toma la solicitud en revisión. */
export const startReview = defineAction({ permission: "solicitud:decidir", schema: z.object({ requestId: z.string().uuid() }) }, async ({ input, session }) => {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, input.requestId)).for("update");
    const [a] = r ? await tx.select({ head: areas.headUserId }).from(areas).where(eq(areas.id, r.areaId)) : [];
    if (!r || a?.head !== session.userId) throw new BusinessError("Solicitud no encontrada.");
    if (r.status !== "ENVIADA") throw new BusinessError("La solicitud ya no está en estado «Enviada».");
    await tx.update(purchaseRequests).set({ status: "EN_REVISION", updatedAt: new Date(), updatedBy: session.userId }).where(eq(purchaseRequests.id, r.id));
    await audit(tx, session, { table: "purchase_requests", recordId: r.id, action: "TOMAR_EN_REVISION", oldData: { status: r.status }, newData: { status: "EN_REVISION" } });
  });
  return { data: undefined, message: "Solicitud en revisión." };
});

export const decideRequest = defineAction({ permission: "solicitud:decidir", schema: decideRequestSchema }, async ({ input, session }) => {
  const notifIds: string[] = [];
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, input.requestId)).for("update");
    const [a] = r ? await tx.select({ head: areas.headUserId }).from(areas).where(eq(areas.id, r.areaId)) : [];
    // Autorización por objeto: solo el jefe del área de la solicitud, y nunca su propia solicitud.
    if (!r || a?.head !== session.userId) throw new BusinessError("Solicitud no encontrada.");
    if (r.requesterId === session.userId) throw new BusinessError("No puedes aprobar tu propia solicitud.");
    if (!["ENVIADA", "EN_REVISION"].includes(r.status)) throw new BusinessError("La solicitud ya fue resuelta por otra persona. Actualiza la pantalla.");

    const next = input.decision === "APROBAR" ? "APROBADA" : input.decision === "RECHAZAR" ? "RECHAZADA" : "DEVUELTA";
    await tx.update(purchaseRequests).set({
      status: next, decidedBy: session.userId, decidedAt: new Date(), decisionReason: input.reason ?? null,
      updatedAt: new Date(), updatedBy: session.userId, changeReason: input.reason ?? null,
    }).where(eq(purchaseRequests.id, r.id));
    await audit(tx, session, {
      table: "purchase_requests", recordId: r.id, action: input.decision === "APROBAR" ? "APROBAR_SOLICITUD" : input.decision === "RECHAZAR" ? "RECHAZAR_SOLICITUD" : "DEVOLVER_SOLICITUD",
      oldData: { status: r.status }, newData: { status: next }, comment: input.reason,
    });

    const [requester] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, r.requesterId));
    const label = { APROBADA: "aprobada", RECHAZADA: "rechazada", DEVUELTA: "devuelta para corrección" }[next];
    if (requester) notifIds.push(...await enqueue(tx, [{
      userId: requester.id, toEmail: requester.email, type: `SOLICITUD_${next}`, entityType: "purchase_requests", entityId: r.id, linkPath: `/solicitudes/${r.id}`,
      subject: `Solicitud ${r.folio} ${label}`, body: `Tu solicitud «${r.title}» fue ${label}.${input.reason ? `\nMotivo: ${input.reason}` : ""}`,
    }]));
    if (next === "APROBADA") {
      const buyers = await recipientsByRole(tx, ["COMPRAS"]);
      notifIds.push(...await enqueue(tx, buyers.map((b) => ({
        userId: b.id, toEmail: b.email, type: "SOLICITUD_APROBADA_COMPRAS", entityType: "purchase_requests", entityId: r.id, linkPath: `/ordenes/nueva?solicitud=${r.id}`,
        subject: `Solicitud aprobada por atender — ${r.folio}`, body: `La solicitud «${r.title}» fue aprobada. Selecciona proveedor y genera la orden de compra.`,
      }))));
    }
  });
  await flushSafely(notifIds);
  return { data: undefined, message: "Decisión registrada." };
});
