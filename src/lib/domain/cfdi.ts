import { XMLParser } from "fast-xml-parser";

export type CfdiConcept = {
  productKey: string | null; description: string; uomCode: string | null; satUnit: string | null;
  quantity: string; unitPrice: string; subtotal: string; taxAmount: string;
};
export type Cfdi = {
  uuid: string; series: string | null; folio: string; issuedAt: Date;
  issuerRfc: string; issuerName: string | null; receiverRfc: string; currency: string;
  subtotal: string; taxTotal: string; total: string; concepts: CfdiConcept[];
};

export class CfdiError extends Error {}
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * Lee un CFDI 3.3/4.0 (solo estructura; la validación fiscal con el SAT/PAC es una integración futura).
 * `taxTotal` = TotalImpuestosTrasladados del comprobante (o suma de traslados de los conceptos).
 */
export function parseCfdi(xml: string): Cfdi {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, processEntities: false });
  let doc: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { doc = p.parse(xml); } catch { throw new CfdiError("El XML no es válido."); }
  const c = doc?.Comprobante;
  if (!c) throw new CfdiError("El XML no es un CFDI (no contiene «Comprobante»).");
  const tfd = c?.Complemento?.TimbreFiscalDigital;
  const uuid = String(tfd?.["@UUID"] ?? "").toUpperCase();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid)) throw new CfdiError("El CFDI no está timbrado (UUID ausente o inválido).");
  const issuerRfc = String(c.Emisor?.["@Rfc"] ?? "").toUpperCase();
  const receiverRfc = String(c.Receptor?.["@Rfc"] ?? "").toUpperCase();
  const folio = String(c["@Folio"] ?? "").trim() || uuid.slice(0, 8); // algunos CFDI no traen folio: se usa el prefijo del UUID
  if (!issuerRfc || !receiverRfc) throw new CfdiError("El CFDI no contiene RFC de emisor y receptor.");

  const concepts: CfdiConcept[] = arr<any>(c.Conceptos?.Concepto).map((k) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const tax = arr<any>(k.Impuestos?.Traslados?.Traslado).reduce((s, t) => s + Number(t["@Importe"] ?? 0), 0); // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      productKey: k["@NoIdentificacion"] ? String(k["@NoIdentificacion"]).trim() : null,
      description: String(k["@Descripcion"] ?? ""),
      uomCode: k["@Unidad"] ? String(k["@Unidad"]).trim() : null,
      satUnit: k["@ClaveUnidad"] ? String(k["@ClaveUnidad"]).trim() : null,
      quantity: String(k["@Cantidad"]), unitPrice: String(k["@ValorUnitario"]),
      subtotal: Number(k["@Importe"]).toFixed(2), taxAmount: tax.toFixed(2),
    };
  });
  if (!concepts.length) throw new CfdiError("El CFDI no contiene conceptos.");
  const sub = Number(c["@SubTotal"]), total = Number(c["@Total"]);
  if (!Number.isFinite(sub) || !Number.isFinite(total)) throw new CfdiError("Subtotal o total inválidos en el CFDI.");
  const taxTotal = c.Impuestos?.["@TotalImpuestosTrasladados"] !== undefined
    ? Number(c.Impuestos["@TotalImpuestosTrasladados"]) : concepts.reduce((s, k) => s + Number(k.taxAmount), 0);

  return {
    uuid, series: c["@Serie"] ? String(c["@Serie"]) : null, folio,
    issuedAt: new Date(String(c["@Fecha"])), issuerRfc, issuerName: c.Emisor?.["@Nombre"] ? String(c.Emisor["@Nombre"]) : null,
    receiverRfc, currency: String(c["@Moneda"] ?? "MXN"),
    subtotal: sub.toFixed(2), taxTotal: taxTotal.toFixed(2), total: total.toFixed(2), concepts,
  };
}
