import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { verifyFileSignature } from "@/lib/crypto";
import { readPrivate } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Descarga de archivo privado. TRES controles independientes:
 *  1) sesión válida,  2) URL firmada (HMAC) vigente y ligada a ESTE usuario (≤ 5 min),  3) autorización por objeto
 *  (el proveedor solo accede a archivos de su proveedor; internos necesitan permiso de lectura).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  const url = new URL(req.url);
  if (!verifyFileSignature(params.id, session.userId, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? ""))
    return new NextResponse("Enlace inválido o vencido. Vuelve a abrir el documento desde el sistema.", { status: 403 });

  const [att] = await db.select().from(attachments).where(eq(attachments.id, params.id));
  if (!att) return new NextResponse("No encontrado", { status: 404 });

  const allowed = session.isSupplier
    ? att.supplierId !== null && att.supplierId === session.supplierId
    : ["oc:ver_todas", "factura:ver_todas", "recepcion:ver", "pago:ver", "solicitud:ver_todas"].some((p) => session.permissions.has(p as never));
  if (!allowed) return new NextResponse("No encontrado", { status: 404 });

  const blob = await readPrivate(att.blobPathname);
  if (!blob || blob.statusCode !== 200) return new NextResponse("Archivo no disponible", { status: 404 });
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
