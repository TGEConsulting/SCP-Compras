import "server-only";
import { headers } from "next/headers";
import { auditLogs } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Session } from "./auth";

export type AuditEntry = {
  table: string;
  recordId: string | null;
  action: string; // CREAR, APROBAR, ENVIAR_PROVEEDOR, RECIBIR, CARGAR_FACTURA, CONCILIAR, AUTORIZAR_PAGO…
  oldData?: unknown;
  newData?: unknown;
  comment?: string | null;
  origin?: "web" | "cron" | "seed" | "sistema";
};

/**
 * Registra en la MISMA transacción que el cambio: si el cambio se revierte, la auditoría también,
 * y si la auditoría falla, el cambio no se confirma. Los datos sensibles se redactan antes de llegar aquí.
 */
export async function audit(tx: DbOrTx, session: Session | null, e: AuditEntry) {
  let ip: string | null = null;
  try { ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null; } catch { /* fuera de request (cron/seed) */ }
  await tx.insert(auditLogs).values({
    userId: session?.userId ?? null,
    userName: session?.name ?? null,
    roles: session?.roles ?? null,
    tableName: e.table,
    recordId: e.recordId,
    action: e.action,
    oldData: (e.oldData ?? null) as never,
    newData: (e.newData ?? null) as never,
    comment: e.comment ?? null,
    origin: e.origin ?? "web",
    ip,
  });
}
