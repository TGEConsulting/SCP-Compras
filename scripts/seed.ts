/**
 * Seeds iniciales (idempotentes). Catálogos base SIEMPRE; usuarios/proveedores de demostración solo con SEED_DEMO_USERS=true.
 *   npm run db:seed
 * Los datos demo son ficticios (RFC genéricos) — NO usar en producción.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as s from "../src/db/schema";

neonConfig.webSocketConstructor = ws;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Define DATABASE_URL_UNPOOLED");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema: s });

  // ── Roles
  const roleDefs: [s.RoleCode, string][] = [
    ["SOLICITANTE", "Solicitante"], ["JEFE_AREA", "Jefe de área"], ["COMPRAS", "Compras"], ["ALMACEN", "Almacén"],
    ["CALIDAD", "Calidad"], ["FINANZAS", "Contabilidad / Finanzas"], ["PROVEEDOR", "Proveedor"], ["ADMIN", "Administrador"],
  ];
  await db.insert(s.roles).values(roleDefs.map(([code, name]) => ({ code, name }))).onConflictDoNothing();
  const roleId = Object.fromEntries((await db.select().from(s.roles)).map((r) => [r.code, r.id]));

  // ── Unidades, categorías, parámetros
  await db.insert(s.unitsOfMeasure).values([
    { code: "KG", name: "Kilogramo", satKey: "KGM" }, { code: "L", name: "Litro", satKey: "LTR" }, { code: "PZA", name: "Pieza", satKey: "H87" },
    { code: "CAJA", name: "Caja", satKey: "XBX" }, { code: "G", name: "Gramo", satKey: "GRM" },
  ]).onConflictDoNothing();
  await db.insert(s.productCategories).values([
    { code: "MP-LACT", name: "Materia prima láctea" }, { code: "INSUMOS", name: "Insumos y aditivos" }, { code: "EMPAQUE", name: "Material de empaque" },
    { code: "QUIMICOS", name: "Químicos de limpieza y sanitización" }, { code: "REFACC", name: "Refacciones y mantenimiento" },
  ]).onConflictDoNothing();
  await db.insert(s.systemSettings).values([
    { key: "tolerancia.precio_pct", value: 0, description: "% de diferencia de precio unitario permitido sin autorización (0 = exacto)" },
    { key: "tolerancia.monto_abs", value: 0.01, description: "Tolerancia absoluta en pesos por redondeo" },
    { key: "recepcion.sobreentrega_pct", value: 0, description: "% de sobre-entrega aceptable sobre lo ordenado" },
    { key: "empresa.rfc", value: process.env.COMPANY_RFC ? sql`${JSON.stringify(process.env.COMPANY_RFC.toUpperCase())}::jsonb` : sql`'null'::jsonb`, description: "RFC receptor esperado en facturas (null = no validar). CONFIGURAR antes de producción" },
    { key: "factura.recordatorios_horas", value: [24, 48], description: "Horas tras la recepción para recordar al proveedor" },
    { key: "factura.escalamiento_dias_habiles", value: 5, description: "Días hábiles para escalar a Compras y Contabilidad" },
    { key: "factura.max_archivo_mb", value: 10, description: "Tamaño máximo por archivo de factura (MB)" },
  ]).onConflictDoNothing();

  // ── Planta, áreas, centros de costo
  await db.insert(s.plants).values({ code: "P01", name: "Planta principal" }).onConflictDoNothing();
  const [plant] = await db.select().from(s.plants).where(eq(s.plants.code, "P01"));
  const areaDefs = [["PROD", "Producción"], ["MANT", "Mantenimiento"], ["CAL", "Calidad"], ["ALM", "Almacén"], ["COMP", "Compras"], ["FIN", "Finanzas"]] as const;
  await db.insert(s.areas).values(areaDefs.map(([code, name]) => ({ plantId: plant!.id, code, name }))).onConflictDoNothing();
  const areaId = Object.fromEntries((await db.select().from(s.areas)).map((a) => [a.code, a.id]));
  await db.insert(s.costCenters).values(areaDefs.map(([code, name]) => ({ code: `CC-${code}`, name: `CC ${name}`, areaId: areaId[code] }))).onConflictDoNothing();

  // ── Productos de ejemplo (ajustar al catálogo real)
  const uom = Object.fromEntries((await db.select().from(s.unitsOfMeasure)).map((u) => [u.code, u.id]));
  const cat = Object.fromEntries((await db.select().from(s.productCategories)).map((c) => [c.code, c.id]));
  await db.insert(s.products).values([
    { sku: "CUL-001", name: "Cultivo láctico mesófilo", categoryId: cat["INSUMOS"], uomId: uom["G"]!, requiresColdChain: true, maxArrivalTempC: "-18.0", requiresTechSheet: true },
    { sku: "CUA-001", name: "Cuajo líquido", categoryId: cat["INSUMOS"], uomId: uom["L"]!, requiresColdChain: true, maxArrivalTempC: "8.0", requiresTechSheet: true },
    { sku: "SAL-001", name: "Sal grado alimenticio", categoryId: cat["INSUMOS"], uomId: uom["KG"]!, requiresExpiryDate: false },
    { sku: "EMP-001", name: "Bolsa termoencogible para queso", categoryId: cat["EMPAQUE"], uomId: uom["PZA"]!, requiresExpiryDate: false },
    { sku: "QUI-001", name: "Detergente alcalino CIP", categoryId: cat["QUIMICOS"], uomId: uom["L"]!, requiresTechSheet: true },
  ]).onConflictDoNothing();

  // ── Administrador inicial (siempre, si se define ADMIN_EMAIL)
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (adminEmail) {
    const [u] = await db.insert(s.users).values({ email: adminEmail, name: "Administrador", plantId: plant!.id, areaId: areaId["COMP"] }).onConflictDoNothing().returning();
    const id = u?.id ?? (await db.select().from(s.users).where(eq(s.users.email, adminEmail)))[0]!.id;
    await db.insert(s.userRoles).values({ userId: id, roleId: roleId["ADMIN"]! }).onConflictDoNothing();
    console.log(`Administrador pre-registrado: ${adminEmail} (inicia sesión con Clerk con ese correo)`);
  }

  // ── Demo (solo desarrollo)
  if (process.env.SEED_DEMO_USERS === "true") {
    const nextYear = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
    await db.insert(s.suppliers).values([
      { code: "PRV-001", rfc: "AAA010101AAA", legalName: "Cultivos y Fermentos Demo S.A. de C.V.", email: "proveedor1@demo.lq", status: "AUTORIZADO", documentsValidUntil: nextYear },
      { code: "PRV-002", rfc: "BBB010101BBB", legalName: "Empaques del Bajío Demo S.A. de C.V.", email: "proveedor2@demo.lq", status: "AUTORIZADO", documentsValidUntil: nextYear },
    ]).onConflictDoNothing();
    const sup = Object.fromEntries((await db.select().from(s.suppliers)).map((x) => [x.code, x.id]));
    const demo: { email: string; name: string; roles: s.RoleCode[]; area?: string; supplier?: string }[] = [
      { email: "solicitante@demo.lq", name: "Sofía Solicitante", roles: ["SOLICITANTE"], area: "PROD" },
      { email: "jefe.produccion@demo.lq", name: "Jorge Jefe de Producción", roles: ["JEFE_AREA"], area: "PROD" },
      { email: "compras@demo.lq", name: "Carla Compras", roles: ["COMPRAS"], area: "COMP" },
      { email: "almacen@demo.lq", name: "Alberto Almacén", roles: ["ALMACEN"], area: "ALM" },
      { email: "calidad@demo.lq", name: "Carmen Calidad", roles: ["CALIDAD"], area: "CAL" },
      { email: "finanzas@demo.lq", name: "Fernando Finanzas", roles: ["FINANZAS"], area: "FIN" },
      { email: "usuario.proveedor1@demo.lq", name: "Paola Proveedor", roles: ["PROVEEDOR"], supplier: "PRV-001" },
    ];
    for (const d of demo) {
      const [u] = await db.insert(s.users).values({ email: d.email, name: d.name, plantId: plant!.id, areaId: d.area ? areaId[d.area] : null, supplierId: d.supplier ? sup[d.supplier] : null }).onConflictDoNothing().returning();
      const id = u?.id ?? (await db.select().from(s.users).where(eq(s.users.email, d.email)))[0]!.id;
      for (const r of d.roles) await db.insert(s.userRoles).values({ userId: id, roleId: roleId[r]! }).onConflictDoNothing();
    }
    const [boss] = await db.select().from(s.users).where(eq(s.users.email, "jefe.produccion@demo.lq"));
    await db.update(s.areas).set({ headUserId: boss!.id }).where(eq(s.areas.code, "PROD"));
    console.log("Usuarios demo creados (@demo.lq). Para entrar, crea esas cuentas en Clerk (dev) con los mismos correos.");
  }

  await pool.end();
  console.log("Seed completo.");
}
main().catch((e) => { console.error(e); process.exit(1); });
