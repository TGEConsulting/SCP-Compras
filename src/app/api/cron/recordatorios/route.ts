import { and, eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { invoices, purchaseOrders, receipts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { businessDaysBetween } from "@/lib/format";
import { enqueue, flushNotifications } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { recipientsByRole, supplierRecipients } from "@/server/services/invoice-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diario (vercel.json). Recordatorios al proveedor a las 24/48 h y escalamiento a Compras + Contabilidad
 * tras N días hábiles sin factura. `dedupe_key` UNIQUE hace el proceso idempotente (re-ejecutarlo no duplica correos).
 */
export async function GET(req: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  if (!process.env.CRON_SECRET || got.length !== expected.length || !timingSafeEqual(got, expected))
    return new NextResponse("No autorizado", { status: 401 });

  const cfg = await getSettings(db, ["factura.recordatorios_horas", "factura.escalamiento_dias_habiles"]);
  const hours = cfg["factura.recordatorios_horas"] as readonly number[];
  const escalateDays = Number(cfg["factura.escalamiento_dias_habiles"]);

  // Órdenes con recepción pendiente de factura y sin factura vigente
  const pending = await db.select({
    orderId: receipts.orderId, folio: purchaseOrders.folio, supplierId: purchaseOrders.supplierId, since: sql<Date>`min(${receipts.receivedAt})`,
  }).from(receipts).innerJoin(purchaseOrders, eq(purchaseOrders.id, receipts.orderId))
    .where(and(eq(receipts.status, "PENDIENTE_FACTURA"), sql`not exists (select 1 from ${invoices} i where i.order_id = ${receipts.orderId} and i.status <> 'RECHAZADA')`))
    .groupBy(receipts.orderId, purchaseOrders.folio, purchaseOrders.supplierId);

  let queued = 0;
  for (const p of pending) {
    const since = new Date(p.since);
    const elapsedH = (Date.now() - since.getTime()) / 36e5;
    await db.transaction(async (tx) => {
      for (const h of hours) {
        if (elapsedH < h) continue;
        const ids = await enqueue(tx, (await supplierRecipients(tx, p.supplierId)).map((r) => ({
          userId: r.userId, supplierId: p.supplierId, toEmail: r.email, type: `RECORDATORIO_FACTURA_${h}H`, entityType: "purchase_orders", entityId: p.orderId,
          linkPath: `/proveedor/ordenes/${p.orderId}`, dedupeKey: `rec${h}:${p.orderId}:${r.email}`,
          subject: `Recordatorio: falta tu factura de la orden ${p.folio}`, body: `Recibimos tu mercancía de la orden ${p.folio} y aún no hemos recibido tu factura (PDF y XML). Sin ella no podemos liberar el pago.`,
        })));
        queued += ids.length;
      }
      if (businessDaysBetween(since, new Date()) >= escalateDays) {
        const ids = await enqueue(tx, (await recipientsByRole(tx, ["COMPRAS", "FINANZAS"])).map((u) => ({
          userId: u.id, toEmail: u.email, type: "ESCALAMIENTO_FACTURA", entityType: "purchase_orders", entityId: p.orderId, linkPath: `/ordenes/${p.orderId}`,
          dedupeKey: `esc:${p.orderId}:${u.id}`, subject: `Escalamiento: factura pendiente más de ${escalateDays} días hábiles — ${p.folio}`,
          body: `La orden ${p.folio} tiene mercancía recibida desde ${since.toLocaleDateString("es-MX")} y el proveedor no ha cargado la factura.`,
        })));
        if (ids.length) await audit(tx, null, { table: "purchase_orders", recordId: p.orderId, action: "ESCALAR_FACTURA_PENDIENTE", comment: `>${escalateDays} días hábiles`, origin: "cron" });
        queued += ids.length;
      }
    });
  }
  const flushed = await flushNotifications(); // también reintenta las que quedaron PENDIENTE/ERROR
  return NextResponse.json({ ordenesPendientes: pending.length, encoladas: queued, ...flushed });
}
