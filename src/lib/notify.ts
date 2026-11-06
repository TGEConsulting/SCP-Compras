import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { Resend } from "resend";
import { db, type DbOrTx } from "@/db";
import { notifications } from "@/db/schema";

export type NotifyInput = {
  userId?: string | null; supplierId?: string | null; toEmail: string;
  type: string; subject: string; body: string; linkPath?: string;
  entityType?: string; entityId?: string; dedupeKey?: string;
};

/**
 * Patrón OUTBOX: la notificación se inserta dentro de la transacción del negocio (estado PENDIENTE).
 * Después del commit se llama a flushNotifications(); si el correo falla queda PENDIENTE/ERROR y el cron la reintenta.
 * Así nunca se envía un correo de algo que se revirtió, ni se pierde uno de algo confirmado.
 */
export async function enqueue(tx: DbOrTx, items: NotifyInput[]): Promise<string[]> {
  if (!items.length) return [];
  const rows = await tx.insert(notifications).values(items.map((i) => ({ ...i, userId: i.userId ?? null, supplierId: i.supplierId ?? null })))
    .onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
  return rows.map((r) => r.id);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function render(subject: string, body: string, link?: string | null) {
  const url = link ? `${process.env.APP_URL ?? ""}${link}` : null;
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
  <h2 style="color:#134868;margin:0 0 12px">${esc(subject)}</h2>
  <p style="line-height:1.5;white-space:pre-line">${esc(body)}</p>
  ${url ? `<p><a href="${esc(url)}" style="background:#1f6fa8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir en el sistema</a></p>` : ""}
  <p style="font-size:12px;color:#6b7280">Productos Lácteos La Quinta · Mensaje automático, no responder.</p></div>`;
}

export async function flushNotifications(ids?: string[]) {
  const pending = await db.select().from(notifications)
    .where(ids?.length ? and(inArray(notifications.id, ids), inArray(notifications.status, ["PENDIENTE", "ERROR"])) : inArray(notifications.status, ["PENDIENTE", "ERROR"]))
    .limit(50);
  if (!pending.length) return { sent: 0, failed: 0 };
  const key = process.env.RESEND_API_KEY;
  const resend = key ? new Resend(key) : null;
  let sent = 0, failed = 0;
  for (const n of pending) {
    try {
      if (!resend) throw new Error("RESEND_API_KEY no configurada");
      const { error } = await resend.emails.send({
        from: process.env.MAIL_FROM ?? "Compras La Quinta <onboarding@resend.dev>",
        to: n.toEmail, subject: n.subject, html: render(n.subject, n.body, n.linkPath),
      });
      if (error) throw new Error(error.message);
      await db.update(notifications).set({ status: "ENVIADA", sentAt: new Date(), error: null }).where(eq(notifications.id, n.id));
      sent++;
    } catch (e) {
      failed++;
      await db.update(notifications).set({ status: "ERROR", error: (e as Error).message.slice(0, 500) }).where(eq(notifications.id, n.id));
    }
  }
  return { sent, failed };
}

/** Atajo para usar tras el commit sin romper la respuesta al usuario si el correo falla. */
export async function flushSafely(ids: string[]) {
  try { await flushNotifications(ids); } catch (e) { console.error("[notify] flush falló", (e as Error).message); }
}
