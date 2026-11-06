import "server-only";
import { del, get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { attachments } from "@/db/schema";
import type { DbOrTx } from "@/db";
import { sha256Hex } from "./crypto";

/** Tipos permitidos por categoría. El tipo declarado por el navegador NO es de fiar: también se valida la firma del archivo. */
const MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  xml: ["application/xml", "text/xml"],
  image: ["image/jpeg", "image/png", "image/webp"],
  doc: ["application/pdf", "image/jpeg", "image/png"],
};
export type FileCategory = keyof typeof MIME;

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  const head = buf.subarray(0, 200).toString("utf8").trimStart();
  if (head.startsWith("<?xml") || head.startsWith("<cfdi:")) return "application/xml";
  return null;
}

export class FileValidationError extends Error {}

export type StoredBlob = { pathname: string; fileName: string; contentType: string; sizeBytes: number; sha256: string; buffer: Buffer };

/** Valida y sube a Vercel Blob en modo PRIVADO. Ruta aleatoria; nunca se expone una URL pública. */
export async function uploadPrivate(file: File, category: FileCategory, folder: string, maxMb = 10): Promise<StoredBlob> {
  if (file.size === 0) throw new FileValidationError(`El archivo «${file.name}» está vacío.`);
  if (file.size > maxMb * 1024 * 1024) throw new FileValidationError(`«${file.name}» excede ${maxMb} MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const real = sniff(buffer);
  if (!real || !MIME[category]!.includes(real)) throw new FileValidationError(`«${file.name}» no es un archivo válido (${category.toUpperCase()}).`);
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const pathname = `${folder}/${randomUUID()}-${safeName}`;
  await put(pathname, buffer, { access: "private", contentType: real, addRandomSuffix: false });
  return { pathname, fileName: file.name, contentType: real, sizeBytes: buffer.length, sha256: sha256Hex(buffer), buffer };
}

export async function recordAttachment(tx: DbOrTx, b: StoredBlob, meta: {
  ownerType: string; ownerId: string; kind: string; supplierId?: string | null; uploadedBy: string;
}) {
  const [row] = await tx.insert(attachments).values({
    ownerType: meta.ownerType, ownerId: meta.ownerId, kind: meta.kind, supplierId: meta.supplierId ?? null,
    blobPathname: b.pathname, fileName: b.fileName, contentType: b.contentType, sizeBytes: b.sizeBytes, sha256: b.sha256, uploadedBy: meta.uploadedBy,
  }).returning({ id: attachments.id });
  return row!.id;
}

/** Limpieza compensatoria si la transacción falla después de subir. */
export async function discardBlobs(blobs: StoredBlob[]) {
  await Promise.allSettled(blobs.map((b) => del(b.pathname)));
}

/** Lectura autenticada de un blob privado (la usa la ruta /api/archivos/[id]). */
export async function readPrivate(pathname: string) {
  return get(pathname, { access: "private" });
}
