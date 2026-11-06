import "server-only";
import { inArray } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import type { DbOrTx } from "@/db";
import type { Tolerances } from "./domain/reconciliation";

/** Parámetros configurables por el administrador (tabla system_settings). Valores por defecto = el más estricto. */
export const SETTING_DEFAULTS = {
  "tolerancia.precio_pct": 0,
  "tolerancia.monto_abs": 0.01,
  "recepcion.sobreentrega_pct": 0,
  "empresa.rfc": null as string | null, // RFC receptor esperado en facturas; null = no validar
  "empresa.razon_social": "Productos Lácteos La Quinta S.A. de C.V.",
  "factura.recordatorios_horas": [24, 48],
  "factura.escalamiento_dias_habiles": 5,
  "factura.max_archivo_mb": 10,
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings<K extends SettingKey>(tx: DbOrTx, keys: readonly K[]): Promise<{ [P in K]: (typeof SETTING_DEFAULTS)[P] }> {
  const rows = await tx.select().from(systemSettings).where(inArray(systemSettings.key, [...keys]));
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = rows.find((r) => r.key === k)?.value ?? SETTING_DEFAULTS[k];
  return out as { [P in K]: (typeof SETTING_DEFAULTS)[P] };
}

export async function getTolerances(tx: DbOrTx): Promise<Tolerances> {
  const s = await getSettings(tx, ["tolerancia.precio_pct", "tolerancia.monto_abs"]);
  return { pricePct: Number(s["tolerancia.precio_pct"]), amountAbs: Number(s["tolerancia.monto_abs"]) };
}
