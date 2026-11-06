import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requirePage } from "@/lib/auth";
import { date, money, qtyFmt } from "@/lib/format";
import { getOrder } from "@/server/queries";

/** Orden de compra imprimible / «Guardar como PDF» desde el navegador. */
export default async function Page({ params }: { params: { id: string } }) {
  const s = await requirePage(["oc:ver_todas", "proveedor:portal"]);
  const o = await getOrder(s, params.id);
  if (!o) notFound();
  const { po, supplier } = o;
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <div className="mb-6 flex items-start justify-between"><div><h1 className="text-2xl font-semibold">Orden de compra {po.folio}</h1><p className="text-gray-600">Productos Lácteos La Quinta S.A. de C.V.</p></div><PrintButton /></div>
      <div className="mb-4 grid grid-cols-2 gap-4"><div><p className="font-semibold">Proveedor</p><p>{supplier.legalName}</p><p>RFC {supplier.rfc}</p><p>{supplier.email}</p></div>
        <div><p>Fecha: {date(po.createdAt)}</p><p>Condiciones de pago: {po.paymentTerms ?? "—"}</p><p>Entrega en: {po.deliveryAddress ?? "—"}</p><p>Compromiso: {date(po.promisedDate)}</p></div></div>
      <table className="w-full border-collapse"><thead><tr className="border-b-2 border-gray-800 text-left"><th className="py-1">Producto</th><th>Cantidad</th><th className="text-right">Precio</th><th className="text-right">Importe</th></tr></thead>
        <tbody>{o.items.map((i) => <tr key={i.id} className="border-b border-gray-200"><td className="py-1">{i.description}<span className="block text-xs text-gray-500">{i.sku}</span></td><td>{qtyFmt(i.quantity)} {i.uom}</td><td className="text-right">{money(i.unitPrice)}</td><td className="text-right">{money(i.lineSubtotal)}</td></tr>)}</tbody></table>
      <dl className="ml-auto mt-4 w-56 space-y-1"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(po.subtotal)}</dd></div><div className="flex justify-between"><dt>IVA</dt><dd>{money(po.taxTotal)}</dd></div><div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd>{money(po.total)}</dd></div></dl>
      {po.notes && <p className="mt-4"><strong>Notas:</strong> {po.notes}</p>}
      <p className="mt-6 text-xs text-gray-500">Factura (PDF y XML) a cargar en el portal de proveedores citando el folio {po.folio}. Las cantidades rechazadas por Calidad no serán pagadas.</p>
    </div>
  );
}
