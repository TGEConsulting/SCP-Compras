import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { OrderForm } from "@/components/order-form";
import { requirePage } from "@/lib/auth";
import { catalogSuppliers, getRequest } from "@/server/queries";

export default async function Page({ searchParams }: { searchParams: { solicitud?: string } }) {
  const s = await requirePage("oc:crear");
  if (!searchParams.solicitud) notFound();
  const r = await getRequest(s, searchParams.solicitud);
  if (!r) notFound();
  if (r.req.status !== "APROBADA") return (<><PageHeader title="Generar orden de compra" /><Alert tone="amber">Esta solicitud no está aprobada o ya tiene una orden de compra.</Alert></>);
  const suppliers = await catalogSuppliers();
  return (
    <>
      <PageHeader title={`Orden de compra para ${r.req.folio}`} subtitle={r.req.title} />
      <OrderForm requestId={r.req.id} suppliers={suppliers.map((x) => ({ id: x.id, name: x.name, rfc: x.rfc, docs: x.docs }))}
        items={r.items.map((i) => ({ id: i.id, product: i.product, uom: i.uom, quantity: i.quantity, estimatedUnitPrice: i.estimatedUnitPrice }))} />
    </>
  );
}
