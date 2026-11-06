import Link from "next/link";
import { eq } from "drizzle-orm";
import { PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { invoices } from "@/db/schema";
import { requirePage } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { INVOICE_STATUS, PAYMENT_STATUS } from "@/lib/status";
import { listInvoices, listPayments } from "@/server/queries";

export default async function Page() {
  const s = await requirePage("pago:ver");
  const [ready, authorized] = await Promise.all([listInvoices(s, {}, eq(invoices.status, "LISTA_PARA_PAGO")), listPayments("AUTORIZADO")]);
  return (
    <>
      <PageHeader title="Pagos" subtitle="Solo aparecen facturas conciliadas con recepción aceptada." />
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Listas para autorizar</h2>
      <Table head={["Factura", "Orden", "Proveedor", "Emitida", "Total", "Estatus"]} empty={ready.rows.length ? undefined : "No hay facturas listas para pago."}>
        {ready.rows.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand-600 underline" href={`/facturas/${r.id}`}>{r.number}</Link></Td><Td>{r.orderFolio}</Td><Td>{r.supplier}</Td><Td>{date(r.issuedAt)}</Td><Td>{money(r.total)}</Td><Td><StatusBadge def={INVOICE_STATUS[r.status]} /></Td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">Autorizados por registrar</h2>
      <Table head={["Factura", "Proveedor", "Monto", "Autorizado", "Estatus"]} empty={authorized.length ? undefined : "No hay pagos pendientes de registrar."}>
        {authorized.map((p) => <tr key={p.id}><Td><Link className="font-medium text-brand-600 underline" href={`/facturas/${p.invoiceId}`}>{p.invoiceNumber}</Link></Td><Td>{p.supplier}</Td><Td>{money(p.amount)}</Td><Td>{date(p.authorizedAt)}</Td><Td><StatusBadge def={PAYMENT_STATUS[p.status]} /></Td></tr>)}
      </Table>
    </>
  );
}
