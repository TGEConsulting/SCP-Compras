/**
 * Aplica las migraciones versionadas de ./drizzle usando la conexión DIRECTA (sin pooler).
 *   DATABASE_URL_UNPOOLED=... npm run db:migrate
 * Nunca ejecutar contra producción sin haberlo probado en una rama de Neon y sin confirmación explícita.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Define DATABASE_URL_UNPOOLED");
  const host = new URL(url).host;
  console.log(`Migrando base en ${host} …`);
  const pool = new Pool({ connectionString: url, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migraciones aplicadas.");
}
main().catch((e) => { console.error(e); process.exit(1); });
