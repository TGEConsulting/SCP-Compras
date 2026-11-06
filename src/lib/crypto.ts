import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer {
  const b64 = process.env.DATA_ENCRYPTION_KEY;
  if (!b64) throw new Error("DATA_ENCRYPTION_KEY no configurada");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY debe ser de 32 bytes (base64)");
  return k;
}

/** AES-256-GCM. Formato: base64(iv).base64(tag).base64(ciphertext) */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptText(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) throw new Error("Formato cifrado inválido");
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const sha256Hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

// ── URLs firmadas y temporales para descarga de archivos privados ──
const secret = () => {
  const s = process.env.FILE_URL_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error("FILE_URL_SIGNING_SECRET debe tener 32+ caracteres");
  return s;
};
const mac = (attachmentId: string, userId: string, exp: number) =>
  createHmac("sha256", secret()).update(`${attachmentId}.${userId}.${exp}`).digest("hex");

/** Enlace válido por `ttlSeconds`, atado al usuario que lo solicitó. */
export function signFileUrl(attachmentId: string, userId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/archivos/${attachmentId}?exp=${exp}&sig=${mac(attachmentId, userId, exp)}`;
}

export function verifyFileSignature(attachmentId: string, userId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const a = Buffer.from(mac(attachmentId, userId, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
