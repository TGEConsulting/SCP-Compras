import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/request-form";
import { Alert, Card, History, LinkButton, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/use-action";
import { requirePage } from "@/lib/auth";
import { date, dateTime, money, qtyFmt } from "@/lib/format";
import { REQUEST_STATUS } from "@/lib/status";
import { decideRequest, startReview } from "@/server/actions/requests";
import { catalogCostCenters, catalogProducts, getRequest, historyFor } from "@/server/queries";

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: { editar?: string } }) {
  const s = await requirePage(["solicitud:crear", "solicitud:ver_todas", "solicitud:decidir"]);
  const r = await getRequest(s, params.id); // el alcance (propias / área / todas) se aplica en la consulta
  if (!r) notFound();
  const { req } = r;
  const isOwner = req.requesterId === s.userId;
  const isHead = r.areaHead === s.userId && !isOwner;
  const canEdit = isOwner && ["BORRADOR", "DEVUELTA"].includes(req.status);

  if (canEdit && searchParams.editar) {
    const [products, costCenters] = await Promise.all([catalogProducts(), catalogCostCenters()]);
    return (<><PageHeader title={`Editar ${req.folio}`} /><RequestForm products={products} costCenters={costCenters} initial={{
      requestId: req.id, title: req.title, justification: req.justification, costCenterId: req.costCenterId ?? "", neededBy: req.neededBy ?? "",
      items: r.items.map((i) => ({ productId: i.productId, quantity: i.quantity, description: i.description ?? "", estimatedUnitPrice: i.estimatedUnitPrice ?? "" })),
    }} /></>);
  }
  const history = await historyFor("purchase_requests", [req.id]);
  return (
    <>
      <PageHeader title={`${req.folio} · ${req.title}`} subtitle={`${r.requester} · ${r.area} · ${dateTime(req.createdAt)}`} actions={<StatusBadge def={REQUEST_STATUS[req.status]} />} />
      <div className="space-y-4">
        {req.status === "DEVUELTA" && <Alert tone="amber" title="Tu jefe de área devolvió la solicitud">{req.decisionReason}</Alert>}
        {req.status === "RECHAZADA" && <Alert tone="red" title="Solicitud rechazada">{req.decisionReason}</Alert>}
        <Card title="Detalle">
          <p className="mb-3 text-sm">{req.justification}</p>
          <p className="mb-3 text-xs text-gray-500">Fecha requerida: {date(req.neededBy)} · Centro de costos: {r.costCenter ?? "—"}</p>
          <Table head={["Producto", "Cantidad", "Unidad", "Precio estimado"]}>
            {r.items.map((i) => <tr key={i.id}><Td>{i.product}<span className="block text-xs text-gray-500">{i.sku}{i.description ? ` · ${i.description}` : ""}</span></Td><Td>{qtyFmt(i.quantity)}</Td><Td>{i.uom}</Td><Td>{money(i.estimatedUnitPrice)}</Td></tr>)}
          </Table>
        </Card>

        <div className="flex flex-wrap gap-2">
          {canEdit && <LinkButton href={`/solicitudes/${req.id}?editar=1`} variant="secondary">Editar y reenviar</LinkButton>}
          {isHead && req.status === "ENVIADA" && <ActionButton action={startReview} payload={{ requestId: req.id }} variant="secondary">Tomar en revisión</ActionButton>}
          {isHead && ["ENVIADA", "EN_REVISION"].includes(req.status) && (<>
            <ActionButton action={decideRequest} payload={{ requestId: req.id, decision: "APROBAR" }} confirm="¿Aprobar esta solicitud? Pasará al área de Compras.">Aprobar</ActionButton>
            <ActionButton action={decideRequest} payload={{ requestId: req.id, decision: "DEVOLVER" }} variant="secondary" reasonLabel="¿Qué debe corregir el solicitante?" reasonField="reason">Devolver</ActionButton>
            <ActionButton action={decideRequest} payload={{ requestId: req.id, decision: "RECHAZAR" }} variant="danger" reasonLabel="Motivo del rechazo" reasonField="reason">Rechazar</ActionButton>
          </>)}
          {s.permissions.has("oc:crear") && req.status === "APROBADA" && <LinkButton href={`/ordenes/nueva?solicitud=${req.id}`}>Generar orden de compra</LinkButton>}
          {r.order && s.permissions.has("oc:ver_todas") && <Link className="self-center text-sm text-brand-600 underline" href={`/ordenes/${r.order.id}`}>Ver orden {r.order.folio}</Link>}
        </div>
        <Card title="Historial"><History rows={history} /></Card>
      </div>
    </>
  );
}
