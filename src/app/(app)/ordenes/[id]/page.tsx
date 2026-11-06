import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, History, LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/use-action";
import { SignedLink } from "@/components/signed-link";
import { requirePage } from "@/lib/auth";
import { date, dateTime, money, qtyFmt } from "@/lib/format";
import { INDICATOR, ORDER_STATUS, RECEIPT_STATUS } from "@/lib/status";
import { cancelOrder, sendOrder } from "@/server/actions/orders";
import { getOrder, historyFor } from "@/server/queries";
import { MISSING_INVOICE_WARNING } from "@/server/services/invoice-service";

export default async function Page({ params }: { params: { id: string } }) {
  const s = await requirePage("oc:ver_todas");
  const o = await getOrder(s, params.id);
  if (!o) notFound();
  const { po, supplier, indicator } = o;
  const history = await historyFor("purchase_orders", [po.id]);
  const canReceive = s.permissions.has("recepcion:registrar") && ["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL"].includes(po.status);
  return (
    <>
      <PageHeader title={`Orden ${po.folio}`} subtitle={`${supplier.legalName} · ${supplier.rfc}`} actions={<StatusBadge def={ORDER_STATUS[po.status]} />} />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {s.permissions.has("oc:enviar") && po.status === "OC_GENERADA" && <ActionButton action={sendOrder} payload={{ orderId: po.id }} confirm={`¿Enviar la orden ${po.folio} a ${supplier.legalName}? Recibirá un correo y la verá en su portal.`}>Enviar al proveedor</ActionButton>}
          <LinkButton href={`/ordenes/${po.id}/imprimir`} variant="secondary">Imprimir / PDF</LinkButton>
          {s.permissions.has("oc:crear") && ["OC_GENERADA", "ENVIADA_PROVEEDOR", "CONFIRMADA", "EN_TRANSITO"].includes(po.status) && o.receipts.length === 0 && !indicator.invoiceId && <ActionButton action={cancelOrder} payload={{ orderId: po.id }} variant="danger" reasonLabel="Motivo de la cancelación" minReason={10}>Cancelar orden</ActionButton>}
          {canReceive && <LinkButton href={`/recepcion/${po.id}`}>Registrar recepción</LinkButton>}
        </div>
        <Card title="Resumen">
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-gray-500">Total</dt><dd className="font-semibold">{money(po.total)}</dd></div>
            <div><dt className="text-gray-500">Fecha compromiso</dt><dd>{date(po.promisedDate)}</dd></div>
            <div><dt className="text-gray-500">Guía</dt><dd>{po.trackingNumber ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Factura</dt><dd className="flex items-center gap-2"><StatusBadge def={INDICATOR[indicator.state]} />{indicator.invoiceId && <Link className="text-brand-600 underline" href={`/facturas/${indicator.invoiceId}`}>Ver</Link>}</dd></div>
          </dl>
        </Card>
        {indicator.state === "NO_CARGADA" && o.receipts.length > 0 && <Alert tone="amber">{MISSING_INVOICE_WARNING}</Alert>}
        <Card title="Partidas">
          <Table head={["Producto", "Ordenado", "Recibido", "Aceptado", "Rechazado", "Pendiente", "Precio", "Importe"]}>
            {o.items.map((i) => (
              <tr key={i.id}><Td>{i.description}<span className="block text-xs text-gray-500">{i.sku}</span></Td><Td>{qtyFmt(i.quantity)} {i.uom}</Td><Td>{qtyFmt(i.received)}</Td><Td>{qtyFmt(i.accepted)}</Td>
                <Td className={Number(i.rejected) > 0 ? "font-medium text-red-700" : ""}>{qtyFmt(i.rejected)}</Td><Td>{qtyFmt(Math.max(0, Number(i.quantity) - Number(i.accepted)))}</Td><Td>{money(i.unitPrice)}</Td><Td>{money(i.lineSubtotal)}</Td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Recepciones">
          {o.receipts.length === 0 ? <p className="text-sm text-gray-500">Aún no hay recepciones.</p> : (
            <Table head={["Folio", "Fecha", "Recibió", "Factura al recibir", "Estatus"]}>
              {o.receipts.map((r) => <tr key={r.id}><Td>{r.folio}</Td><Td>{dateTime(r.receivedAt)}</Td><Td>{r.by}</Td><Td>{INDICATOR[r.invoiceAtReceipt]?.label ?? r.invoiceAtReceipt}</Td><Td><StatusBadge def={RECEIPT_STATUS[r.status]} /></Td></tr>)}
            </Table>)}
        </Card>
        <Card title="Historial"><History rows={history} /></Card>
        {indicator.pdfAttachmentId && <p className="text-sm"><SignedLink session={s} attachmentId={indicator.pdfAttachmentId}>Ver factura del proveedor (PDF)</SignedLink></p>}
      </div>
    </>
  );
}
