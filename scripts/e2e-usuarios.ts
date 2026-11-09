/**
 * Usuarios de prueba para el recorrido E2E (solo STAGING).
 *   E2E_PASSWORD=... CLERK_SECRET_KEY=... DATABASE_URL_UNPOOLED=... npx tsx scripts/e2e-usuarios.ts up|down
 * up   → crea 6 usuarios en Clerk (correos +clerk_test, código 424242) y los liga a los usuarios demo (@demo.lq).
 * down → los borra de Clerk y devuelve los usuarios demo a su correo original (sin vínculo).
 * Se niega a correr si la base no contiene los usuarios demo (p. ej. producción).
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as s from "../src/db/schema";

neonConfig.webSocketConstructor = ws;
const MAP: Record<string, string> = {
  "solicitante@demo.lq": "qa.solicitante+clerk_test@example.com",
  "jefe.produccion@demo.lq": "qa.jefe+clerk_test@example.com",
  "compras@demo.lq": "qa.compras+clerk_test@example.com",
  "almacen@demo.lq": "qa.almacen+clerk_test@example.com",
  "finanzas@demo.lq": "qa.finanzas+clerk_test@example.com",
  "usuario.proveedor1@demo.lq": "qa.proveedor+clerk_test@example.com",
};
const clerk = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`https://api.clerk.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`, "Content-Type": "application/json", "User-Agent": "lq-compras-e2e/1.0" } });
  if (!r.ok) throw new Error(`Clerk ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function main() {
  const mode = process.argv[2];
  if (mode !== "up" && mode !== "down") throw new Error("Uso: e2e-usuarios.ts up|down");
  if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Solo con llave de Clerk de desarrollo (sk_test_).");
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Define DATABASE_URL_UNPOOLED");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema: s });
  const demo = await db.select({ email: s.users.email }).from(s.users).where(inArray(s.users.email, [...Object.keys(MAP), ...Object.values(MAP)]));
  if (demo.length === 0) throw new Error("No hay usuarios demo en esta base: no es staging con seed demo. Abortado.");

  if (mode === "up") {
    const pw = process.env.E2E_PASSWORD;
    if (!pw || pw.length < 12) throw new Error("Define E2E_PASSWORD (12+ caracteres).");
    for (const [demoEmail, qa] of Object.entries(MAP)) {
      const found = await clerk(`/users?email_address=${encodeURIComponent(qa)}`);
      if (!found.length) await clerk("/users", { method: "POST", body: JSON.stringify({ email_address: [qa], password: pw, skip_password_checks: true }) });
      await db.update(s.users).set({ email: qa, authId: null }).where(eq(s.users.email, demoEmail));
      console.log("listo", qa);
    }
  } else {
    for (const [demoEmail, qa] of Object.entries(MAP)) {
      for (const u of await clerk(`/users?email_address=${encodeURIComponent(qa)}`)) await clerk(`/users/${u.id}`, { method: "DELETE" });
      await db.update(s.users).set({ email: demoEmail, authId: null }).where(eq(s.users.email, qa));
      console.log("restaurado", demoEmail);
    }
  }
  await pool.end();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
