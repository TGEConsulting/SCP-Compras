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
