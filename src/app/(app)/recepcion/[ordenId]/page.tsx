import { notFound } from "next/navigation";
import { Alert, Card, PageHeader, StatusBadge } from "@/components/ui";
import { ReceiptForm } from "@/components/receipt-form";
import { SignedLink } from "@/components/signed-link";
import { requirePage } from "@/lib/auth";
import { date } from "@/lib/format";
import { INDICATOR } from "@/lib/status";
import { getOrder } from "@/server/queries";
import { MISSING_INVOICE_WARNING } from "@/server/services/invoice-service";

export const dynamic = "force-dynamic";

/**
 * Al abrir la pantalla se CONSULTA en servidor si el proveedor ya cargó la factura (getOrder → getInvoiceIndicator).
 * El indicador se muestra siempre y «Ver factura del proveedor» solo se habilita si existe.
 */
export default async function Page({ params }: { params: { ordenId: string } }) {
  const s = await requirePage("recepcion:registrar");
  const o = await getOrder(s, params.ordenId);
  if (!o) notFound();
  const { po, supplier, indicator } = o;
  const receivable = ["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"].includes(po.status);
  const invoiceExists = indicator.state !== "NO_CARGADA";

  return (
    <>
      <PageHeader title={`Recepción · ${po.folio}`} subtitle={`${supplier.legalName} · Compromiso ${date(po.promisedDate)}`} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <span className="text-sm font-medium text-gray-700">Estatus de factura:</span>
        <StatusBadge def={INDICATOR[indicator.state]} />
        {indicator.pdfAttachmentId
          ? <SignedLink session={s} attachmentId={indicator.pdfAttachmentId} className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium hover:bg-gray-50">Ver factura del proveedor</SignedLink>
          : <button disabled className="inline-flex min-h-[44px] cursor-not-allowed items-center rounded-md border border-gray-200 bg-gray-50 px-4 text-sm text-gray-400" title="El proveedor aún no la ha cargado">Ver factura del proveedor</button>}
      </div>
      {!invoiceExists && <div className="mb-4"><Alert tone="amber" title="Factura no cargada">{MISSING_INVOICE_WARNING}</Alert></div>}
      {!receivable ? <Alert tone="amber">Esta orden no está disponible para recepción (estatus actual: {po.status}).</Alert> : (
        <ReceiptForm orderId={po.id} invoiceExists={invoiceExists} warning={MISSING_INVOICE_WARNING} tracking={po.trackingNumber}
          lines={o.items.map((i) => ({
            id: i.id, description: i.description, sku: i.sku, uom: i.uom, ordered: i.quantity, received: i.accepted,
            pending: String(Math.max(0, +(Number(i.quantity) - Number(i.accepted)).toFixed(3))), coldChain: i.coldChain, maxTemp: i.maxTemp, needsExpiry: i.needsExpiry,
          }))} />
      )}
      <Card className="mt-4" title="Nota"><p className="text-sm text-gray-600">«Ya recibido» muestra lo aceptado hasta ahora. Las cantidades rechazadas no cuentan y el proveedor debe reponerlas.</p></Card>
    </>
  );
}
