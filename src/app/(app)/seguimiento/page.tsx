import Link from "next/link";
import { Card, PageHeader, StatusBadge, Table, Td } from "@/components/ui";
import { db } from "@/db";
import { requirePage } from "@/lib/auth";
import { businessDaysBetween, date, money } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { INVOICE_STATUS } from "@/lib/status";
import { seguimiento } from "@/server/queries";

export default async function Page() {
  await requirePage(["factura:ver_todas", "oc:ver_todas"]);
  const [d, st] = await Promise.all([seguimiento(), getSettings(db, ["factura.escalamiento_dias_habiles"])]);
  const limite = Number(st["factura.escalamiento_dias_habiles"]);
  const hoy = new Date();
  const dias = (f: Date | null) => (f ? businessDaysBetween(f, hoy) : 0);
  const retenido = d.sinFactura.reduce((s, r) => s + Number(r.total), 0) + d.conProblema.reduce((s, r) => s + Number(r.total), 0);
  const kpi = [
    { l: "Recepciones sin factura", v: d.sinFactura.length, h: "Pago bloqueado" },
    { l: "Facturas con problema", v: d.conProblema.length, h: "Diferencia, bloqueada o en validación" },
    { l: "Monto detenido", v: money(retenido), h: "Sin factura o con problema" },
    { l: "Listas para pago", v: `${d.porPagar.n} · ${money(d.porPagar.total)}`, h: "Esperan a Finanzas" },
  ];
  return (
    <>
      <PageHeader title="Seguimiento" subtitle={`Lo que está detenido y desde cuándo. Se marca en rojo a partir de ${limite} días hábiles.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi.map((k) => <div key={k.l} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"><p className="text-2xl font-semibold text-brand-700">{k.v}</p><p className="mt-1 text-sm text-gray-700">{k.l}</p><p className="text-xs text-gray-500">{k.h}</p></div>)}
      </div>
      <div className="space-y-6">
        <Card title="Recepciones sin factura del proveedor">
          {d.sinFactura.length === 0 ? <p className="text-sm text-gray-500">Nada pendiente.</p> : (
            <Table head={["Recepción", "Orden", "Proveedor", "Recibida", "Días hábiles", "Monto de la orden"]}>
              {d.sinFactura.map((r) => { const n = dias(r.receivedAt); return (
                <tr key={r.id}><Td>{r.folio}</Td><Td><Link className="text-brand-600 underline" href={`/ordenes/${r.orderId}`}>{r.orderFolio}</Link></Td><Td>{r.supplier}</Td><Td>{date(r.receivedAt)}</Td>
                  <Td className={n >= limite ? "font-semibold text-red-700" : ""}>{n}</Td><Td>{money(r.total)}</Td></tr>); })}
            </Table>)}
        </Card>
        <Card title="Facturas con diferencia, bloqueadas o en validación">
          {d.conProblema.length === 0 ? <p className="text-sm text-gray-500">Sin facturas con problemas.</p> : (
            <Table head={["Factura", "Orden", "Proveedor", "Estatus", "Días hábiles", "Motivo principal"]}>
              {d.conProblema.map((r) => { const n = dias(r.createdAt); return (
                <tr key={r.id}><Td><Link className="font-medium text-brand-600 underline" href={`/facturas/${r.id}`}>{r.number}</Link></Td><Td>{r.orderFolio}</Td><Td>{r.supplier}</Td>
                  <Td><StatusBadge def={INVOICE_STATUS[r.status]} /></Td><Td className={n >= limite ? "font-semibold text-red-700" : ""}>{n}</Td><Td>{r.detail ?? "—"}</Td></tr>); })}
            </Table>)}
        </Card>
        <Card title="Órdenes enviadas que el proveedor no ha confirmado">
          {d.sinConfirmar.length === 0 ? <p className="text-sm text-gray-500">Todas las órdenes enviadas están confirmadas.</p> : (
            <Table head={["Orden", "Proveedor", "Enviada", "Días hábiles", "Monto"]}>
              {d.sinConfirmar.map((r) => { const n = dias(r.sentAt); return (
                <tr key={r.id}><Td><Link className="text-brand-600 underline" href={`/ordenes/${r.id}`}>{r.folio}</Link></Td><Td>{r.supplier}</Td><Td>{date(r.sentAt)}</Td>
                  <Td className={n >= 2 ? "font-semibold text-red-700" : ""}>{n}</Td><Td>{money(r.total)}</Td></tr>); })}
            </Table>)}
        </Card>
      </div>
    </>
  );
}
