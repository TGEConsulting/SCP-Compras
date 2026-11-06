import Link from "next/link";
import { FilterBar, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { date } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/status";
import { listReceivable } from "@/server/queries";

export default async function Page({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
  const s = await requirePage(["recepcion:registrar", "recepcion:ver"]);
  const { rows, hasNext, page } = await listReceivable(s, { ...searchParams, page: Number(searchParams.page) || 1 });
  const canReceive = s.permissions.has("recepcion:registrar");
  return (
    <>
      <PageHeader title="Recepción de mercancía" subtitle="Busca por folio de OC, proveedor o número de guía." />
      <FilterBar action="/recepcion" q={searchParams.q} status={searchParams.status} statuses={{ CONFIRMADA: ORDER_STATUS.CONFIRMADA!, EN_TRANSITO: ORDER_STATUS.EN_TRANSITO!, RECIBIDA_PARCIAL: ORDER_STATUS.RECIBIDA_PARCIAL! }} />
      <Table head={["Orden", "Proveedor", "Guía", "Fecha compromiso", "Estatus", ""]} empty={rows.length ? undefined : "No hay órdenes pendientes de recibir con esa búsqueda."}>
        {rows.map((o) => (
          <tr key={o.id} className="hover:bg-gray-50">
            <Td className="font-medium">{o.folio}</Td><Td>{o.supplier}</Td><Td>{o.trackingNumber ?? "—"}</Td><Td>{date(o.promisedDate)}</Td><Td><StatusBadge def={ORDER_STATUS[o.status]} /></Td>
            <Td>{canReceive ? <Link className="font-medium text-brand-600 underline" href={`/recepcion/${o.id}`}>Recibir</Link> : <Link className="text-brand-600 underline" href={`/ordenes/${o.id}`}>Ver</Link>}</Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} hasNext={hasNext} basePath="/recepcion" params={searchParams} />
    </>
  );
}
