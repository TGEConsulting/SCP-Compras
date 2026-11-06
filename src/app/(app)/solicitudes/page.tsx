import Link from "next/link";
import { FilterBar, LinkButton, PageHeader, Pagination, StatusBadge, Table, Td } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { date } from "@/lib/format";
import { REQUEST_STATUS } from "@/lib/status";
import { listRequests } from "@/server/queries";

export default async function Page({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
  const s = await requirePage(["solicitud:crear", "solicitud:ver_todas", "solicitud:decidir"]);
  const { rows, hasNext, page } = await listRequests(s, { ...searchParams, page: Number(searchParams.page) || 1 });
  return (
    <>
      <PageHeader title="Solicitudes de compra" subtitle={s.permissions.has("solicitud:ver_todas") ? "Todas las solicitudes" : s.permissions.has("solicitud:ver_area") ? "Las de tu área y las tuyas" : "Tus solicitudes"}
        actions={s.permissions.has("solicitud:crear") ? <LinkButton href="/solicitudes/nueva">Nueva solicitud</LinkButton> : undefined} />
      <FilterBar action="/solicitudes" q={searchParams.q} status={searchParams.status} statuses={REQUEST_STATUS} />
      <Table head={["Folio", "Título", "Solicitante", "Área", "Fecha requerida", "Estatus"]} empty={rows.length ? undefined : "No hay solicitudes con esos filtros."}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-gray-50">
            <Td><Link className="font-medium text-brand-600 underline" href={`/solicitudes/${r.id}`}>{r.folio}</Link></Td>
            <Td>{r.title}</Td><Td>{r.requester}</Td><Td>{r.area}</Td><Td>{date(r.neededBy)}</Td><Td><StatusBadge def={REQUEST_STATUS[r.status]} /></Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} hasNext={hasNext} basePath="/solicitudes" params={searchParams} />
    </>
  );
}
