import { PageHeader } from "@/components/ui";
import { SettingRow } from "@/components/setting-row";
import { db } from "@/db";
import { requirePage } from "@/lib/auth";
import { getSettings, SETTING_DEFAULTS, type SettingKey } from "@/lib/settings";

const DESC: Record<SettingKey, string> = {
  "tolerancia.precio_pct": "% de diferencia de precio unitario aceptado sin autorización. 0 = exacto.",
  "tolerancia.monto_abs": "Tolerancia en pesos por redondeo de importes.",
  "recepcion.sobreentrega_pct": "% de sobre-entrega aceptable sobre lo ordenado.",
  "empresa.rfc": "RFC receptor esperado en las facturas, entre comillas (ej. \"ABC010101AB1\"). null = no validar.",
  "empresa.razon_social": "Razón social de la empresa, entre comillas.",
  "factura.recordatorios_horas": "Horas tras la recepción para recordar la factura al proveedor, como lista: [24,48].",
  "factura.escalamiento_dias_habiles": "Días hábiles para escalar a Compras y Contabilidad.",
  "factura.max_archivo_mb": "Tamaño máximo por archivo de factura (MB).",
};

export default async function Page() {
  await requirePage("admin:catalogos");
  const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
  const vals = await getSettings(db, keys);
  return (<><PageHeader title="Parámetros" subtitle="Cada cambio queda en la bitácora de auditoría." /><div className="space-y-3">{keys.map((k) => <SettingRow key={k} k={k} description={DESC[k]} value={vals[k]} />)}</div></>);
}
