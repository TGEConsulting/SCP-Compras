import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card, History, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { PaymentPanel } from "@/components/supplier-panels";
import { SignedLink } from "@/components/signed-link";
import { ActionButton } from "@/components/use-action";
import { requirePage } from "@/lib/auth";
import { date, money, qtyFmt } from "@/lib/format";
import { INVOICE_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { authorizeDifference, rejectInvoice } from "@/server/actions/invoices";
import { getInvoice, historyFor } from "@/server/queries";

const SEV = { BLOQUEO: { label: "Bloqueo", tone: "red" }, DIFERENCIA: { label: "Diferencia", tone: "amber" }, AVISO: { label: "Aviso", tone: "gray" } } as const;

export default async function Page({ params }: { params: { id: string } }) {
  const s = await requirePage("factura:ver_todas");
  const r = await getInvoice(s, params.id);
  if (!r) notFound();
  const { inv, diffs, items, payment } = r;
  const canAuth = s.permissions.has("factura:autorizar_diferencia");
  const history = await historyFor("invoices", [inv.id]);
  const pending = diffs.filter((d) => d.severity === "DIFERENCIA" && d.requiresAuthorization && !d.authorizedAt);

  return (
    <>
      <PageHeader title={`Factura ${inv.invoiceNumber}`} subtitle={`${r.supplier} · Orden ${r.orderFolio} · UUID ${inv.uuidCfdi}`} actions={<StatusBadge def={INVOICE_STATUS[inv.status]} />} />
      <div className="space-y-4">
        {inv.status === "BLOQUEADA" && <Alert tone="red" title="Factura bloqueada — el pago no puede liberarse">{inv.blockedReason}</Alert>}
        {["CON_DIFERENCIA", "EN_VALIDACION"].includes(inv.status) && <Alert tone="amber" title="Factura con diferencias — pago bloqueado hasta autorizar o corregir" >Autoriza cada diferencia con su motivo o rechaza la factura para que el proveedor cargue una corregida.</Alert>}
        {inv.status === "CARGADA" && <Alert tone="blue" title="Esperando recepción aceptada">La conciliación se ejecutará automáticamente cuando Almacén/Calidad registre la recepción. El pago permanece bloqueado.</Alert>}

        <Card title="Datos del comprobante">
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-gray-500">Fecha</dt><dd>{date(inv.issuedAt)}</dd></div><div><dt className="text-gray-500">Subtotal</dt><dd>{money(inv.subtotal)}</dd></div>
            <div><dt className="text-gray-500">IVA</dt><dd>{money(inv.taxTotal)}</dd></div><div><dt className="text-gray-500">Total</dt><dd className="font-semibold">{money(inv.total)}</dd></div>
            <div><dt className="text-gray-500">RFC emisor</dt><dd>{inv.issuerRfc}</dd></div><div><dt className="text-gray-500">RFC receptor</dt><dd>{inv.receiverRfc}</dd></div>
            <div className="sm:col-span-2 flex gap-4"><SignedLink session={s} attachmentId={inv.pdfAttachmentId}>Abrir PDF</SignedLink><SignedLink session={s} attachmentId={inv.xmlAttachmentId}>Descargar XML</SignedLink><Link className="text-brand-600 underline" href={`/ordenes/${inv.orderId}`}>Ver orden</Link></div>
          </dl>
        </Card>

        <Card title="Resultado de la conciliación (orden ↔ recepción ↔ factura)">
          {diffs.length === 0 ? <p className="text-sm text-green-800">Sin diferencias. {inv.status === "LISTA_PARA_PAGO" || inv.status === "PAGADA" ? "Conciliada." : "Pendiente de recepción."}</p> : (
            <ul className="space-y-3">
              {diffs.map((d) => (
                <li key={d.id} className="rounded-md border border-gray-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge def={SEV[d.severity]} /><span className="font-medium">{d.message}</span></div>
                  {(d.expected || d.actual) && <p className="mt-1 text-xs text-gray-600">Esperado: {d.expected ?? "—"} · Facturado: {d.actual ?? "—"}</p>}
                  {d.authorizedAt && <p className="mt-1 text-xs text-green-800">Autorizada: {d.authorizationReason}</p>}
                  {canAuth && d.requiresAuthorization && d.severity === "DIFERENCIA" && !d.authorizedAt && (
                    <div className="mt-2"><ActionButton action={authorizeDifference} payload={{ differenceId: d.id }} variant="secondary" reasonLabel="Motivo de la autorización (queda en auditoría)" minReason={10}>Autorizar diferencia</ActionButton></div>)}
                </li>
              ))}
            </ul>)}
          {canAuth && !["PAGADA", "RECHAZADA", "LISTA_PARA_PAGO"].includes(inv.status) && (
            <div className="mt-4"><ActionButton action={rejectInvoice} payload={{ invoiceId: inv.id }} variant="danger" reasonLabel="Motivo del rechazo (se envía al proveedor)" reasonField="reason" minReason={10}>Rechazar factura</ActionButton></div>)}
          {pending.length > 0 && <p className="mt-2 text-xs text-gray-500">{pending.length} diferencia(s) pendiente(s) de autorización.</p>}
        </Card>

        <Card title="Partidas facturadas">
          <Table head={["Concepto", "Cantidad", "Unidad", "P. unitario", "Importe", "IVA", "Partida OC"]}>
            {items.map((i) => <tr key={i.id}><Td>{i.description}</Td><Td>{qtyFmt(i.quantity)}</Td><Td>{i.uomCode ?? "—"}</Td><Td>{money(i.unitPrice)}</Td><Td>{money(i.subtotal)}</Td><Td>{money(i.taxAmount)}</Td><Td>{i.orderItemId ? "Emparejada" : <span className="text-red-700">Sin partida</span>}</Td></tr>)}
          </Table>
        </Card>

        {(inv.status === "LISTA_PARA_PAGO" || payment) && s.permissions.has("pago:ver") && (
          <Card title="Pago">
            {payment && <p className="mb-3 text-sm">Estatus: <StatusBadge def={PAYMENT_STATUS[payment.status]} /> {payment.reference && `· Ref. ${payment.reference}`}</p>}
            {(!payment || payment.status === "AUTORIZADO") && (s.permissions.has("pago:autorizar") || s.permissions.has("pago:registrar"))
              ? (!payment && !s.permissions.has("pago:autorizar") ? null : <PaymentPanel invoiceId={inv.id} paymentId={payment?.id ?? null} />) : null}
          </Card>)}
        <Card title="Historial"><History rows={history} /></Card>
      </div>
    </>
  );
}
