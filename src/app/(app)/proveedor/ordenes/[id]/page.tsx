import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { Alert, Card, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ConfirmOrderPanel, InTransitPanel, InvoiceUploadPanel, OrderDocPanel } from "@/components/supplier-panels";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requirePage } from "@/lib/auth";
import { date, dateTime, money, qtyFmt } from "@/lib/format";
import { INDICATOR, INVOICE_STATUS, ORDER_STATUS } from "@/lib/status";
import { getOrder } from "@/server/queries";
import { activeInvoiceFor } from "@/server/services/invoice-service";

export default async function Page({ params }: { params: { id: string } }) {
  const s = await requirePage("proveedor:portal");
  const o = await getOrder(s, params.id); // devuelve null si la OC es de otro proveedor (aislamiento por consulta)
  if (!o) notFound();
  const { po, indicator } = o;
  const inv = await activeInvoiceFor(db, po.id);
  const comms = await db.select().from(notifications).where(and(eq(notifications.entityId, po.id), eq(notifications.supplierId, s.supplierId!))).orderBy(desc(notifications.createdAt)).limit(20);
  const canInvoice = ["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA_TOTAL"].includes(po.status) && !inv;

  return (
    <>
      <PageHeader title={`Orden ${po.folio}`} subtitle={`Total ${money(po.total)} · Compromiso ${date(po.promisedDate)}`} actions={<StatusBadge def={ORDER_STATUS[po.status]} />} />
      <div className="space-y-4">
        {po.status === "ENVIADA_PROVEEDOR" && <ConfirmOrderPanel orderId={po.id} />}
        {["CONFIRMADA", "EN_TRANSITO"].includes(po.status) && <InTransitPanel orderId={po.id} current={po.trackingNumber} />}

        <Card title="Partidas">
          <Table head={["Producto", "Cantidad", "Precio", "Importe", "Aceptado por La Quinta", "Rechazado"]}>
            {o.items.map((i) => <tr key={i.id}><Td>{i.description}</Td><Td>{qtyFmt(i.quantity)} {i.uom}</Td><Td>{money(i.unitPrice)}</Td><Td>{money(i.lineSubtotal)}</Td><Td>{qtyFmt(i.accepted)}</Td><Td className={Number(i.rejected) > 0 ? "font-medium text-red-700" : ""}>{qtyFmt(i.rejected)}</Td></tr>)}
          </Table>
          {o.items.some((i) => Number(i.rejected) > 0) && <p className="mt-2 text-sm text-red-700">Hay cantidades rechazadas por Calidad. No deben incluirse en la factura; repón la mercancía y coordina nueva entrega.</p>}
        </Card>

        {inv ? (
          <Card title="Mi factura">
            <p className="text-sm">Factura <strong>{inv.invoiceNumber}</strong> · {money(inv.total)} · <StatusBadge def={INVOICE_STATUS[inv.status]} /> <span className="ml-2 text-gray-500">({INDICATOR[indicator.state]?.label})</span></p>
            {inv.blockedReason && <div className="mt-3"><Alert tone="red" title="Tu factura tiene un problema">{inv.blockedReason}</Alert></div>}
            {inv.status === "PAGADA" && <p className="mt-2 text-sm text-green-800">El pago ya fue registrado.</p>}
          </Card>
        ) : canInvoice ? <InvoiceUploadPanel orderId={po.id} blockedHint={po.status === "RECIBIDA_TOTAL" || po.status === "RECIBIDA_PARCIAL" ? "Ya recibimos tu mercancía: carga tu factura para que podamos liberar el pago." : undefined} /> : null}

        {["CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA_TOTAL"].includes(po.status) && <OrderDocPanel orderId={po.id} />}

        <Card title="Comunicaciones y notificaciones">
          {comms.length === 0 ? <p className="text-sm text-gray-500">Sin comunicaciones.</p> : (
            <ul className="space-y-2 text-sm">{comms.map((c) => <li key={c.id}><span className="text-gray-500">{dateTime(c.createdAt)}</span> — <strong>{c.subject}</strong></li>)}</ul>)}
        </Card>
      </div>
    </>
  );
}
