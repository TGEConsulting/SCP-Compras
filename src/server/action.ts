import "server-only";
import { z } from "zod";
import { ForbiddenError, requireAction, type Session } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import { FileValidationError } from "@/lib/storage";
import { withRetry } from "@/db";

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Error de regla de negocio: el mensaje es seguro de mostrar al usuario. */
export class BusinessError extends Error {}

type Ctx<S extends z.ZodTypeAny> = { input: z.infer<S>; session: Session; files: Record<string, File[]> };
type Handler<S extends z.ZodTypeAny, T> = (ctx: Ctx<S>) => Promise<{ data: T; message?: string; redirectTo?: string }>;

/**
 * Envoltura única para TODA Server Action:
 *  1) autenticación + permiso en servidor,  2) validación Zod,  3) manejo uniforme de errores.
 * El cliente envía un objeto plano, o FormData con `payload` (JSON) + archivos (campo = clave).
 * Los errores inesperados se registran y se devuelven genéricos (sin filtrar detalles internos).
 */
export function defineAction<S extends z.ZodTypeAny, T = void>(
  opts: { permission: Permission | Permission[]; schema: S },
  handler: Handler<S, T>,
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    try {
      const session = await requireAction(opts.permission);
      let payload: unknown = raw;
      const files: Record<string, File[]> = {};
      if (raw instanceof FormData) {
        payload = JSON.parse(String(raw.get("payload") ?? "{}"));
        for (const [k, v] of raw.entries()) if (v instanceof File && v.size > 0) (files[k] ??= []).push(v);
      }
      const parsed = opts.schema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: "Revisa los campos marcados.", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
      }
      const res = await withRetry(() => handler({ input: parsed.data, session, files }));
      return { ok: true, ...res };
    } catch (err) {
      if (err instanceof BusinessError || err instanceof ForbiddenError || err instanceof FileValidationError) return { ok: false, error: err.message };
      const code = (err as { code?: string }).code;
      if (code === "23505") return { ok: false, error: "Ese registro ya existe o fue procesado por otro usuario. Actualiza la pantalla e inténtalo de nuevo." };
      console.error("[action] error inesperado", err);
      return { ok: false, error: "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, avisa a soporte." };
    }
  };
}

export const uuid = z.string().uuid("Identificador inválido");
export const money = z.string().regex(/^\d+(\.\d{1,4})?$/, "Importe inválido");
export const qty = z.string().regex(/^\d+(\.\d{1,3})?$/, "Cantidad inválida");
