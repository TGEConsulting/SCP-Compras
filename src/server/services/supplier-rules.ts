import "server-only";
import { BusinessError } from "../action";

/** Proveedor autorizado y con documentación vigente (regla obligatoria antes de comprar o facturar). */
export function assertSupplierEligible(s: { status: string; documentsValidUntil: string | null; legalName: string }) {
  if (s.status !== "AUTORIZADO") throw new BusinessError(`El proveedor «${s.legalName}» no está autorizado.`);
  if (!s.documentsValidUntil || s.documentsValidUntil < new Date().toISOString().slice(0, 10))
    throw new BusinessError(`El proveedor «${s.legalName}» tiene documentación vencida o sin vigencia registrada.`);
}
