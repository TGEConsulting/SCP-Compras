import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

/**
 * Conexión a Neon:
 *  - Usa DATABASE_URL con el endpoint de POOLING (host "-pooler").
 *  - Driver WebSocket (neon-serverless) para soportar transacciones interactivas (db.transaction).
 *  - Pool pequeño por instancia: cada función serverless abre pocas conexiones y PgBouncer multiplexa.
 */
if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;

const globalForDb = globalThis as unknown as { __pool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  // Un cliente inactivo que falla no debe tumbar el proceso.
  pool.on("error", (err: Error) => console.error("[db] error en cliente inactivo", err.message));
  return pool;
}

export const pool = (globalForDb.__pool ??= createPool());
export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Acepta la conexión o una transacción abierta. */
export type DbOrTx = Db | Tx;

const TRANSIENT = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "57P01", "57P03", "08006", "08001", "08003", "40001", "40P01"]);

/**
 * Reintenta SOLO errores transitorios de conexión/serialización (con backoff exponencial + jitter).
 * No envolver operaciones con efectos externos no idempotentes (correo, Blob): reintenta la transacción completa.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const code = (err as { code?: string }).code ?? "";
      if (!TRANSIENT.has(code) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 150 * 2 ** i + Math.random() * 100));
    }
  }
  throw last;
}
