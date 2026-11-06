"use server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, products, roles, suppliers, systemSettings, userRoles, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { SETTING_DEFAULTS } from "@/lib/settings";
import { setAreaHeadSchema, setSettingSchema, upsertProductSchema, upsertSupplierSchema, upsertUserSchema } from "@/lib/validators";
import { BusinessError, defineAction } from "../action";

/** Alta/edición de usuarios y roles. Los roles se reemplazan completos y el cambio queda auditado (antes/después). */
export const upsertUser = defineAction({ permission: "admin:usuarios", schema: upsertUserSchema }, async ({ input, session }) => {
  await db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (dup && dup.id !== input.userId) throw new BusinessError("Ya existe un usuario con ese correo.");
    const roleRows = await tx.select().from(roles);
    const idOf = new Map(roleRows.map((r) => [r.code, r.id]));
    const [plant] = input.areaId ? await tx.select({ p: areas.plantId }).from(areas).where(eq(areas.id, input.areaId)) : [];
    let id = input.userId;
    let before: unknown = null;
    if (id) {
      const [cur] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!cur) throw new BusinessError("Usuario no encontrado.");
      if (id === session.userId && (!input.active || !input.roles.includes("ADMIN"))) throw new BusinessError("No puedes quitarte a ti mismo el rol de administrador ni desactivarte.");
      const rs = await tx.select({ c: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, id));
      before = { email: cur.email, active: cur.active, roles: rs.map((r) => r.c), areaId: cur.areaId, supplierId: cur.supplierId };
      await tx.update(users).set({ email: input.email, name: input.name, areaId: input.areaId ?? null, plantId: plant?.p ?? cur.plantId, supplierId: input.supplierId ?? null, active: input.active, updatedAt: new Date(), updatedBy: session.userId }).where(eq(users.id, id));
    } else {
      const [u] = await tx.insert(users).values({ email: input.email, name: input.name, areaId: input.areaId ?? null, plantId: plant?.p ?? null, supplierId: input.supplierId ?? null, active: input.active, createdBy: session.userId, updatedBy: session.userId }).returning({ id: users.id });
      id = u!.id;
    }
    await tx.delete(userRoles).where(eq(userRoles.userId, id));
    await tx.insert(userRoles).values(input.roles.map((r) => ({ userId: id!, roleId: idOf.get(r)!, grantedBy: session.userId })));
    await audit(tx, session, { table: "users", recordId: id, action: input.userId ? "EDITAR_USUARIO" : "CREAR_USUARIO", oldData: before, newData: { email: input.email, active: input.active, roles: input.roles, areaId: input.areaId, supplierId: input.supplierId } });
  });
  return { data: undefined, message: "Usuario guardado.", redirectTo: "/admin/usuarios" };
});

export const setAreaHead = defineAction({ permission: "admin:usuarios", schema: setAreaHeadSchema }, async ({ input, session }) => {
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(areas).where(eq(areas.id, input.areaId)).for("update");
    if (!a) throw new BusinessError("Área no encontrada.");
    await tx.update(areas).set({ headUserId: input.headUserId, updatedAt: new Date(), updatedBy: session.userId }).where(eq(areas.id, a.id));
    await audit(tx, session, { table: "areas", recordId: a.id, action: "ASIGNAR_JEFE_AREA", oldData: { headUserId: a.headUserId }, newData: { headUserId: input.headUserId } });
  });
  return { data: undefined, message: "Jefe de área asignado." };
});

/** Cambios de estatus/vigencia de proveedor quedan auditados con valores anteriores. */
export const upsertSupplier = defineAction({ permission: "admin:catalogos", schema: upsertSupplierSchema }, async ({ input, session }) => {
  await db.transaction(async (tx) => {
    const v = { code: input.code, rfc: input.rfc, legalName: input.legalName, email: input.email, status: input.status, documentsValidUntil: input.documentsValidUntil ?? null };
    if (input.supplierId) {
      const [cur] = await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).for("update");
      if (!cur) throw new BusinessError("Proveedor no encontrado.");
      await tx.update(suppliers).set({ ...v, updatedAt: new Date(), updatedBy: session.userId }).where(eq(suppliers.id, cur.id));
      await audit(tx, session, { table: "suppliers", recordId: cur.id, action: "EDITAR_PROVEEDOR", oldData: { rfc: cur.rfc, status: cur.status, documentsValidUntil: cur.documentsValidUntil, email: cur.email }, newData: v });
    } else {
      const [s] = await tx.insert(suppliers).values({ ...v, createdBy: session.userId, updatedBy: session.userId }).returning({ id: suppliers.id });
      await audit(tx, session, { table: "suppliers", recordId: s!.id, action: "CREAR_PROVEEDOR", newData: v });
    }
  });
  return { data: undefined, message: "Proveedor guardado.", redirectTo: "/admin/proveedores" };
});

export const upsertProduct = defineAction({ permission: "admin:catalogos", schema: upsertProductSchema }, async ({ input, session }) => {
  if (input.requiresColdChain && !input.maxArrivalTempC) throw new BusinessError("Para cadena fría indica la temperatura máxima de llegada.");
  await db.transaction(async (tx) => {
    const v = { sku: input.sku, name: input.name, uomId: input.uomId, categoryId: input.categoryId ?? null, requiresColdChain: input.requiresColdChain, maxArrivalTempC: input.maxArrivalTempC ?? null, requiresExpiryDate: input.requiresExpiryDate, active: input.active };
    if (input.productId) {
      const [cur] = await tx.select().from(products).where(eq(products.id, input.productId)).for("update");
      if (!cur) throw new BusinessError("Producto no encontrado.");
      await tx.update(products).set({ ...v, updatedAt: new Date(), updatedBy: session.userId }).where(eq(products.id, cur.id));
      await audit(tx, session, { table: "products", recordId: cur.id, action: "EDITAR_PRODUCTO", oldData: { sku: cur.sku, maxArrivalTempC: cur.maxArrivalTempC, requiresColdChain: cur.requiresColdChain, active: cur.active }, newData: v });
    } else {
      const [p] = await tx.insert(products).values({ ...v, createdBy: session.userId, updatedBy: session.userId }).returning({ id: products.id });
      await audit(tx, session, { table: "products", recordId: p!.id, action: "CREAR_PRODUCTO", newData: v });
    }
  });
  return { data: undefined, message: "Producto guardado.", redirectTo: "/admin/productos" };
});

/** Solo claves conocidas; el valor se valida contra el tipo del valor por defecto. */
export const setSetting = defineAction({ permission: "admin:catalogos", schema: setSettingSchema }, async ({ input, session }) => {
  if (!(input.key in SETTING_DEFAULTS)) throw new BusinessError("Parámetro desconocido.");
  let value: unknown;
  try { value = JSON.parse(input.valueJson); } catch { throw new BusinessError("Valor inválido: usa número, texto entre comillas o lista [24,48]."); }
  const def = SETTING_DEFAULTS[input.key as keyof typeof SETTING_DEFAULTS] as unknown;
  const ok = def === null ? value === null || typeof value === "string" : Array.isArray(def) ? Array.isArray(value) && value.every((x) => typeof x === "number" && x > 0) : typeof value === typeof def;
  if (!ok) throw new BusinessError("El tipo del valor no corresponde al parámetro.");
  if (typeof value === "number" && value < 0) throw new BusinessError("No se permiten valores negativos.");
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(systemSettings).where(eq(systemSettings.key, input.key));
    await tx.insert(systemSettings).values({ key: input.key, value: sql`${JSON.stringify(value)}::jsonb` as never, updatedBy: session.userId })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: sql`${JSON.stringify(value)}::jsonb` as never, updatedAt: new Date(), updatedBy: session.userId } });
    await audit(tx, session, { table: "system_settings", recordId: null, action: "CAMBIAR_PARAMETRO", oldData: { key: input.key, value: cur?.value ?? null }, newData: { key: input.key, value } });
  });
  return { data: undefined, message: "Parámetro actualizado." };
});
