import Link from "next/link";
import { FilterBar, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { listOrders } from "@/server/queries";

export default async function Page({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
  const s = await requirePage("oc:ver_todas");
  const { rows, hasNext, page } = await listOrders(s, { ...searchParams, page: Number(searchParams.page) || 1 });
  return (
    <>
      <PageHeader title="Órdenes de compra" />
      <FilterBar action="/ordenes" q={searchParams.q} status={searchParams.status} statuses={ORDER_STATUS} />
      <Table head={["Folio", "Proveedor", "Total", "Fecha compromiso", "Guía", "Estatus"]} empty={rows.length ? undefined : "No hay órdenes con esos filtros."}>
        {rows.map((o) => (
          <tr key={o.id} className="hover:bg-gray-50">
            <Td><Link className="font-medium text-brand-600 underline" href={`/ordenes/${o.id}`}>{o.folio}</Link></Td><Td>{o.supplier}</Td><Td>{money(o.total)}</Td>
            <Td>{date(o.promisedDate)}</Td><Td>{o.trackingNumber ?? "—"}</Td><Td><StatusBadge def={ORDER_STATUS[o.status]} /></Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} hasNext={hasNext} basePath="/ordenes" params={searchParams} />
    </>
  );
}
