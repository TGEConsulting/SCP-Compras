import { describe, expect, it } from "vitest";
import { upsertUserSchema } from "./validators";

const base = { email: "a@b.mx", name: "Persona Prueba", active: true };
const sup = "11111111-1111-4111-8111-111111111111";
describe("upsertUserSchema: separación entre usuarios internos y de proveedor", () => {
  it("acepta proveedor solo con proveedor ligado", () => {
    expect(upsertUserSchema.safeParse({ ...base, roles: ["PROVEEDOR"], supplierId: sup }).success).toBe(true);
    expect(upsertUserSchema.safeParse({ ...base, roles: ["PROVEEDOR"] }).success).toBe(false);
  });
  it("no mezcla rol Proveedor con roles internos", () => {
    expect(upsertUserSchema.safeParse({ ...base, roles: ["PROVEEDOR", "COMPRAS"], supplierId: sup }).success).toBe(false);
  });
  it("un usuario interno no se liga a un proveedor", () => {
    expect(upsertUserSchema.safeParse({ ...base, roles: ["COMPRAS"], supplierId: sup }).success).toBe(false);
    expect(upsertUserSchema.safeParse({ ...base, roles: ["COMPRAS", "ALMACEN"] }).success).toBe(true);
  });
});
