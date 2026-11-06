import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { roles, userRoles, users, type RoleCode } from "@/db/schema";
import { permissionsFor, type Permission } from "./permissions";

/**
 * Autenticación: Clerk (MFA, sesiones y rotación gestionadas; sin contraseñas propias que custodiar).
 * Autorización: 100 % en BD. Clerk solo dice QUIÉN es; los roles viven en `user_roles`.
 * El administrador pre-registra el correo del usuario; en el primer login se enlaza `auth_id`.
 */
export type Session = {
  userId: string;
  name: string;
  email: string;
  roles: RoleCode[];
  permissions: Set<Permission>;
  supplierId: string | null;
  areaId: string | null;
  plantId: string | null;
  isSupplier: boolean;
};

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para realizar esta acción.") { super(message); }
}

export const getSession = cache(async (): Promise<Session | null> => {
  const { userId: authId } = auth();
  if (!authId) return null;

  let row = (await db.select().from(users).where(eq(users.authId, authId)).limit(1))[0];
  if (!row) {
    // Primer login: enlazar por correo verificado por Clerk.
    const cu = await currentUser();
    const email = cu?.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId);
    if (!email || email.verification?.status !== "verified") return null;
    const pre = (await db.select().from(users).where(eq(users.email, email.emailAddress.toLowerCase())).limit(1))[0];
    if (!pre || !pre.active || pre.authId) return null; // no pre-registrado, inactivo o ya enlazado a otra cuenta
    await db.update(users).set({ authId, updatedAt: new Date() }).where(eq(users.id, pre.id));
    row = { ...pre, authId };
  }
  if (!row.active) return null;

  const rr = await db.select({ code: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, row.id));
  const roleCodes = rr.map((r) => r.code as RoleCode);
  return {
    userId: row.id, name: row.name, email: row.email, roles: roleCodes,
    permissions: permissionsFor(roleCodes), supplierId: row.supplierId, areaId: row.areaId, plantId: row.plantId,
    isSupplier: roleCodes.includes("PROVEEDOR"),
  };
});

/** Para páginas: redirige si no hay sesión o no tiene el permiso. */
export async function requirePage(permission?: Permission | Permission[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/sin-acceso");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => s.permissions.has(p))) redirect("/sin-acceso?motivo=permiso");
  }
  return s;
}

/** Para Server Actions: lanza error (no redirige). */
export async function requireAction(permission: Permission | Permission[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new ForbiddenError("Tu sesión expiró. Vuelve a iniciar sesión.");
  const list = Array.isArray(permission) ? permission : [permission];
  if (!list.some((p) => s.permissions.has(p))) throw new ForbiddenError();
  return s;
}

export const can = (s: Session, p: Permission) => s.permissions.has(p);
export async function usersWithRoles(codes: RoleCode[]) {
  return db.select({ id: users.id, email: users.email, name: users.name, areaId: users.areaId })
    .from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.code, codes));
}
