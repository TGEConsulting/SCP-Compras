import { describe, expect, it } from "vitest";
import { diffKey, reconcile, type ReconInput } from "./reconciliation";

const base = (): ReconInput => ({
  order: {
    supplierId: "s1", supplierRfc: "AAA010101AAA",
    lines: [{ id: "L1", sku: "CUL-001", uomCode: "KG", quantity: "100", unitPrice: "50.0000", taxRate: "0.16" }],
  },
  receipts: [{ orderItemId: "L1", received: "100", accepted: "100", rejected: "0" }],
  invoice: {
    head: { supplierId: "s1", issuerRfc: "AAA010101AAA", subtotal: "5000.00", taxTotal: "800.00", total: "5800.00" },
    lines: [{ orderItemId: "L1", description: "Cultivo", uomCode: "KG", quantity: "100", unitPrice: "50.0000", subtotal: "5000.00", taxAmount: "800.00" }],
  },
  tolerances: { pricePct: 0, amountAbs: 0.01 },
});

describe("conciliación de tres vías", () => {
  it("concilia cuando todo coincide", () => {
    const r = reconcile(base());
    expect(r.outcome).toBe("CONCILIADA");
    expect(r.payableTotal).toBe("5800.00");
  });

  it("espera si aún no hay recepción", () => {
    const i = base(); i.receipts = [];
    expect(reconcile(i).outcome).toBe("PENDIENTE_RECEPCION");
  });

  it("bloquea si se factura más de lo aceptado", () => {
    const i = base();
    i.receipts = [{ orderItemId: "L1", received: "100", accepted: "80", rejected: "20" }];
    const r = reconcile(i);
    expect(r.outcome).toBe("BLOQUEADA");
    // 100 facturadas ≤ aceptadas+rechazadas → se identifica como rechazado facturado
    expect(r.differences.map((d) => d.code)).toContain("CANTIDAD_RECHAZADA_FACTURADA");
  });

  it("bloquea si se factura más de lo recibido", () => {
    const i = base();
    i.receipts = [{ orderItemId: "L1", received: "60", accepted: "60", rejected: "0" }];
    expect(reconcile(i).differences.map((d) => d.code)).toContain("CANTIDAD_EXCEDE_ACEPTADA");
  });

  it("precio distinto → diferencia autorizable; una vez autorizada baja a aviso", () => {
    const i = base();
    i.invoice.lines[0]!.unitPrice = "52.0000";
    i.invoice.lines[0]!.subtotal = "5200.00";
    i.invoice.lines[0]!.taxAmount = "832.00";
    i.invoice.head = { ...i.invoice.head, subtotal: "5200.00", taxTotal: "832.00", total: "6032.00" };
    const r1 = reconcile(i);
    expect(r1.outcome).toBe("CON_DIFERENCIA");
    const price = r1.differences.find((d) => d.code === "PRECIO_DISTINTO")!;
    expect(price.requiresAuthorization).toBe(true);
    // el total excede lo aceptado según OC: también requiere autorización
    const total = r1.differences.find((d) => d.code === "TOTAL_EXCEDE_ACEPTADO");
    expect(total).toBeUndefined(); // se omite cuando ya hay diferencia de precio (misma causa)

    i.authorized = new Set([diffKey("PRECIO_DISTINTO", "L1")]);
    expect(reconcile(i).outcome).toBe("CONCILIADA");
  });

  it("respeta la tolerancia de precio configurada", () => {
    const i = base();
    i.tolerances.pricePct = 5;
    i.invoice.lines[0]!.unitPrice = "51.0000"; // 2 %
    i.invoice.lines[0]!.subtotal = "5100.00";
    i.invoice.lines[0]!.taxAmount = "816.00";
    i.invoice.head = { ...i.invoice.head, subtotal: "5100.00", taxTotal: "816.00", total: "5916.00" };
    const r = reconcile(i);
    expect(r.differences.find((d) => d.code === "PRECIO_EN_TOLERANCIA")).toBeTruthy();
    // El total supera lo aceptado según OC → requiere autorización aunque el precio esté en tolerancia
    expect(r.outcome).toBe("CON_DIFERENCIA");
  });

  it("bloquea concepto no ordenado y proveedor distinto", () => {
    const i = base();
    i.invoice.lines.push({ orderItemId: null, description: "Extra", uomCode: "PZA", quantity: "1", unitPrice: "1", subtotal: "1.00", taxAmount: "0.16" });
    i.invoice.head.issuerRfc = "BBB010101BBB";
    const codes = reconcile(i).differences.map((d) => d.code);
    expect(codes).toContain("PRODUCTO_NO_ORDENADO");
    expect(codes).toContain("PROVEEDOR_DISTINTO");
  });

  it("detecta unidad distinta y totales que no cuadran", () => {
    const i = base();
    i.invoice.lines[0]!.uomCode = "L";
    i.invoice.head.total = "5801.00";
    const codes = reconcile(i).differences.map((d) => d.code);
    expect(codes).toContain("UNIDAD_DISTINTA");
    expect(codes).toContain("TOTALES_NO_CUADRAN");
  });

  it("agrega varias recepciones parciales", () => {
    const i = base();
    i.receipts = [
      { orderItemId: "L1", received: "60", accepted: "60", rejected: "0" },
      { orderItemId: "L1", received: "40", accepted: "40", rejected: "0" },
    ];
    expect(reconcile(i).outcome).toBe("CONCILIADA");
  });
});
