import Link from "next/link";
import { FilterBar, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/status";
import { listInvoices } from "@/server/queries";

export default async function Page({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
  const s = await requirePage("factura:ver_todas");
  const { rows, hasNext, page } = await listInvoices(s, { ...searchParams, page: Number(searchParams.page) || 1 });
  return (
    <>
      <PageHeader title="Facturas" subtitle="Cargadas por proveedores y conciliadas contra orden y recepción." />
      <FilterBar action="/facturas" q={searchParams.q} status={searchParams.status} statuses={INVOICE_STATUS} />
      <Table head={["Factura", "Orden", "Proveedor", "Fecha", "Total", "Estatus"]} empty={rows.length ? undefined : "No hay facturas con esos filtros."}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <Td><Link className="font-medium text-brand-600 underline" href={`/facturas/${r.id}`}>{r.number}</Link></Td><Td>{r.orderFolio}</Td><Td>{r.supplier}</Td><Td>{date(r.issuedAt)}</Td><Td>{money(r.total)}</Td>
            <Td><StatusBadge def={INVOICE_STATUS[r.status]} />{r.blockedReason && <span className="mt-1 block max-w-xs text-xs text-red-700">{r.blockedReason}</span>}</Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} hasNext={hasNext} basePath="/facturas" params={searchParams} />
    </>
  );
}
