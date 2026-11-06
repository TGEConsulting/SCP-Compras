import { defineConfig } from "drizzle-kit";

// Las migraciones usan la conexión DIRECTA (sin pooler) para poder tomar locks y usar DDL transaccional.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://localhost/placeholder" },
  strict: true,
  verbose: true,
});
