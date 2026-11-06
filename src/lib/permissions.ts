import type { RoleCode } from "@/db/schema";

/** Permisos atómicos. Las pantallas y Server Actions piden permisos, nunca roles directamente. */
export const PERMISSIONS = [
  "solicitud:crear", "solicitud:ver_todas", "solicitud:ver_area", "solicitud:decidir",
  "oc:crear", "oc:enviar", "oc:ver_todas",
  "proveedor:portal", // ver/confirmar sus OC, cargar facturas y documentos
  "recepcion:registrar", "recepcion:ver",
  "factura:ver_todas", "factura:autorizar_diferencia",
  "pago:ver", "pago:autorizar", "pago:registrar",
  "admin:catalogos", "admin:usuarios", "reportes:ver",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  SOLICITANTE: ["solicitud:crear"],
  JEFE_AREA: ["solicitud:crear", "solicitud:ver_area", "solicitud:decidir", "reportes:ver"],
  COMPRAS: ["solicitud:ver_todas", "oc:crear", "oc:enviar", "oc:ver_todas", "recepcion:ver", "factura:ver_todas", "factura:autorizar_diferencia", "reportes:ver"],
  ALMACEN: ["oc:ver_todas", "recepcion:registrar", "recepcion:ver", "factura:ver_todas"],
  CALIDAD: ["oc:ver_todas", "recepcion:registrar", "recepcion:ver", "factura:ver_todas", "reportes:ver"],
  FINANZAS: ["oc:ver_todas", "recepcion:ver", "factura:ver_todas", "factura:autorizar_diferencia", "pago:ver", "pago:autorizar", "pago:registrar", "reportes:ver"],
  PROVEEDOR: ["proveedor:portal"],
  ADMIN: ["admin:catalogos", "admin:usuarios", "reportes:ver", "solicitud:ver_todas", "oc:ver_todas", "factura:ver_todas", "recepcion:ver"],
};

export function permissionsFor(roles: readonly RoleCode[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) out.add(p);
  return out;
}

export const ROLE_LABELS: Record<RoleCode, string> = {
  SOLICITANTE: "Solicitante", JEFE_AREA: "Jefe de área", COMPRAS: "Compras", ALMACEN: "Almacén",
  CALIDAD: "Calidad", FINANZAS: "Contabilidad / Finanzas", PROVEEDOR: "Proveedor", ADMIN: "Administrador",
};
