import Link from "next/link";
import { PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { INVOICE_STATUS, ORDER_STATUS } from "@/lib/status";
import { listInvoices, listOrders } from "@/server/queries";

export default async function Page({ searchParams }: { searchParams: { page?: string } }) {
  const s = await requirePage("proveedor:portal"); // listOrders/listInvoices ya filtran por el proveedor de la sesión
  const [orders, invs] = await Promise.all([listOrders(s, { page: Number(searchParams.page) || 1 }), listInvoices(s, {})]);
  return (
    <>
      <PageHeader title="Mis órdenes de compra" subtitle="Confirma tus órdenes, indica la fecha compromiso y carga tus facturas." />
      <Table head={["Orden", "Total", "Fecha compromiso", "Estatus"]} empty={orders.rows.length ? undefined : "Aún no tienes órdenes asignadas."}>
        {orders.rows.map((o) => <tr key={o.id}><Td><Link className="font-medium text-brand-600 underline" href={`/proveedor/ordenes/${o.id}`}>{o.folio}</Link></Td><Td>{money(o.total)}</Td><Td>{date(o.promisedDate)}</Td><Td><StatusBadge def={ORDER_STATUS[o.status]} /></Td></tr>)}
      </Table>
      <Pagination page={orders.page} hasNext={orders.hasNext} basePath="/proveedor" params={searchParams} />
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">Estatus de mis facturas</h2>
      <Table head={["Factura", "Orden", "Total", "Estatus"]} empty={invs.rows.length ? undefined : "Aún no has cargado facturas."}>
        {invs.rows.map((r) => <tr key={r.id}><Td>{r.number}</Td><Td>{r.orderFolio}</Td><Td>{money(r.total)}</Td><Td><StatusBadge def={INVOICE_STATUS[r.status]} />{r.status === "PAGADA" && <span className="ml-2 text-xs text-green-800">Pago registrado</span>}</Td></tr>)}
      </Table>
    </>
  );
}
