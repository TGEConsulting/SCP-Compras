import { describe, expect, it } from "vitest";
import { CfdiError, parseCfdi } from "./cfdi";

const xml = (uuid = "6128396F-C09B-4EC6-8699-43C5F7E3B230") => `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="123" Fecha="2026-11-02T10:00:00" SubTotal="5000.00" Total="5800.00" Moneda="MXN">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Cultivos Demo"/>
  <cfdi:Receptor Rfc="XAXX010101000"/>
  <cfdi:Conceptos>
    <cfdi:Concepto NoIdentificacion="CUL-001" ClaveUnidad="KGM" Unidad="KG" Descripcion="Cultivo láctico" Cantidad="100" ValorUnitario="50.00" Importe="5000.00">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="5000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="800.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="800.00"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento>
</cfdi:Comprobante>`;

describe("lector de CFDI", () => {
  it("extrae encabezado y conceptos", () => {
    const c = parseCfdi(xml());
    expect(c.uuid).toBe("6128396F-C09B-4EC6-8699-43C5F7E3B230");
    expect(c.issuerRfc).toBe("AAA010101AAA");
    expect(c.total).toBe("5800.00");
    expect(c.taxTotal).toBe("800.00");
    expect(c.concepts).toHaveLength(1);
    expect(c.concepts[0]).toMatchObject({ productKey: "CUL-001", satUnit: "KGM", quantity: "100", taxAmount: "800.00" });
  });
  it("rechaza XML sin timbre", () => {
    expect(() => parseCfdi(xml("no-es-uuid"))).toThrow(CfdiError);
  });
  it("rechaza XML que no es CFDI", () => {
    expect(() => parseCfdi("<a><b/></a>")).toThrow(CfdiError);
  });
});

// Fixtures sintéticos con la estructura real del SAT (no son facturas reales; reemplazar/añadir con XML reales del proveedor).
const base = (attrs: string, conceptos: string, imp: string, extra = "") => `﻿<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-11-03T09:15:00" Moneda="MXN" ${attrs}>
  <cfdi:Emisor Rfc="LAC850101AB1" Nombre="LACTEOS DEMO SA DE CV" RegimenFiscal="601"/><cfdi:Receptor Rfc="PLQ900101XY1" Nombre="PRODUCTOS LACTEOS LA QUINTA" UsoCFDI="G03"/>
  <cfdi:Conceptos>${conceptos}</cfdi:Conceptos>${imp}
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="0A1B2C3D-1111-4222-8333-444455556666"/>${extra}</cfdi:Complemento>
</cfdi:Comprobante>`;

describe("lector de CFDI — casos de la industria láctea", () => {
  it("acepta BOM y producto con IVA tasa 0% (leche, queso)", () => {
    const x = base(`TipoDeComprobante="I" Serie="F" Folio="77" SubTotal="1000.00" Total="1000.00"`,
      `<cfdi:Concepto ClaveProdServ="50131600" NoIdentificacion="LEC-01" ClaveUnidad="LTR" Unidad="Litro" Descripcion="Leche cruda" Cantidad="500" ValorUnitario="2.00" Importe="1000.00" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.000000" Importe="0.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`,
      `<cfdi:Impuestos TotalImpuestosTrasladados="0.00"/>`);
    const c = parseCfdi(x);
    expect(c.taxTotal).toBe("0.00"); expect(c.total).toBe("1000.00"); expect(c.concepts[0]!.taxAmount).toBe("0.00");
  });
  it("concepto exento no rompe el cálculo", () => {
    const x = base(`TipoDeComprobante="I" SubTotal="100.00" Total="100.00"`,
      `<cfdi:Concepto NoIdentificacion="X" ClaveUnidad="H87" Descripcion="Exento" Cantidad="1" ValorUnitario="100.00" Importe="100.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Exento"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`, ``);
    expect(parseCfdi(x).taxTotal).toBe("0.00");
  });
  it("con descuento, usa importes netos", () => {
    const x = base(`TipoDeComprobante="I" SubTotal="1000.00" Descuento="100.00" Total="1044.00"`,
      `<cfdi:Concepto NoIdentificacion="A" ClaveUnidad="KGM" Descripcion="Queso" Cantidad="10" ValorUnitario="100.00" Importe="1000.00" Descuento="100.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="900.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="144.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`,
      `<cfdi:Impuestos TotalImpuestosTrasladados="144.00"/>`);
    const c = parseCfdi(x);
    expect(c.subtotal).toBe("900.00"); expect(c.concepts[0]!.subtotal).toBe("900.00"); expect(c.total).toBe("1044.00");
  });
  it("rechaza nota de crédito, complemento de pago y retenciones con mensaje claro", () => {
    const c1 = `<cfdi:Concepto NoIdentificacion="A" ClaveUnidad="E48" Descripcion="Flete" Cantidad="1" ValorUnitario="100.00" Importe="100.00"/>`;
    expect(() => parseCfdi(base(`TipoDeComprobante="E" SubTotal="100.00" Total="100.00"`, c1, ""))).toThrow(/nota de crédito/);
    expect(() => parseCfdi(base(`TipoDeComprobante="P" SubTotal="0" Total="0"`, c1, ""))).toThrow(/complemento de pago/);
    expect(() => parseCfdi(base(`TipoDeComprobante="I" SubTotal="100.00" Total="104.00"`, c1, `<cfdi:Impuestos TotalImpuestosRetenidos="4.00" TotalImpuestosTrasladados="16.00"/>`))).toThrow(/retenciones/);
  });
  it("acepta CFDI 3.3 con prefijos distintos y varios conceptos", () => {
    const x = `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="3.3" Serie="B" Folio="9" Fecha="2026-10-01T08:00:00" SubTotal="300.00" Total="348.00" Moneda="MXN" TipoDeComprobante="I">
      <cfdi:Emisor Rfc="lac850101ab1"/><cfdi:Receptor Rfc="PLQ900101XY1"/><cfdi:Conceptos>
      <cfdi:Concepto NoIdentificacion="A" ClaveUnidad="KGM" Unidad="KG" Descripcion="A" Cantidad="1" ValorUnitario="100.00" Importe="100.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="100.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="16.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>
      <cfdi:Concepto NoIdentificacion="B" ClaveUnidad="KGM" Unidad="KG" Descripcion="B" Cantidad="2" ValorUnitario="100.00" Importe="200.00"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="200.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="32.00"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>
      </cfdi:Conceptos><cfdi:Impuestos TotalImpuestosTrasladados="48.00"/><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="aaaaaaaa-1111-4222-8333-444455556666"/></cfdi:Complemento></cfdi:Comprobante>`;
    const c = parseCfdi(x);
    expect(c.concepts).toHaveLength(2); expect(c.issuerRfc).toBe("LAC850101AB1"); expect(c.uuid).toBe("AAAAAAAA-1111-4222-8333-444455556666");
  });
});
