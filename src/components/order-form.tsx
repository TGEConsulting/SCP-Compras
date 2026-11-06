"use client";
import { useState } from "react";
import { createOrder } from "@/server/actions/orders";
import { money, qtyFmt } from "@/lib/format";
import Decimal from "decimal.js";
import { Card, btn, input } from "./ui";
import { Feedback, useAction } from "./use-action";

type Item = { id: string; product: string; uom: string; quantity: string; estimatedUnitPrice: string | null };

export function OrderForm({ requestId, items, suppliers }: { requestId: string; items: Item[]; suppliers: { id: string; name: string; rfc: string; docs: string | null }[] }) {
  const [supplierId, setSupplierId] = useState("");
  const [terms, setTerms] = useState("");
  const [address, setAddress] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.id, i.estimatedUnitPrice ?? ""])));
  const [rates, setRates] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.id, "0.16"])));
  const { run, pending, error, fieldErrors, message } = useAction(createOrder);

  const sub = items.reduce((s, i) => s.plus(new Decimal(i.quantity).times(prices[i.id] || 0)), new Decimal(0));
  const tax = items.reduce((s, i) => s.plus(new Decimal(i.quantity).times(prices[i.id] || 0).times(rates[i.id] || 0)), new Decimal(0));
  const expired = (d: string | null) => !d || d < new Date().toISOString().slice(0, 10);

  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <Card title="Proveedor">
        <label htmlFor="sup" className="mb-1 block text-sm font-medium">Proveedor autorizado</label>
        <select id="sup" className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Selecciona…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id} disabled={expired(s.docs)}>{s.name} ({s.rfc}){expired(s.docs) ? " — documentación vencida" : ""}</option>)}
        </select>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="terms" className="mb-1 block text-sm font-medium">Condiciones de pago</label><input id="terms" className={input} value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
          <div><label htmlFor="addr" className="mb-1 block text-sm font-medium">Dirección de entrega</label><input id="addr" className={input} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
      </Card>
      <Card title="Partidas y precios">
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} className="grid gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-12">
              <div className="sm:col-span-5"><p className="text-sm font-medium">{i.product}</p><p className="text-xs text-gray-500">{qtyFmt(i.quantity)} {i.uom}</p></div>
              <div className="sm:col-span-3"><label className="mb-1 block text-xs text-gray-600" htmlFor={`pr${i.id}`}>Precio unitario (MXN)</label>
                <input id={`pr${i.id}`} inputMode="decimal" className={input} value={prices[i.id]} onChange={(e) => setPrices({ ...prices, [i.id]: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="mb-1 block text-xs text-gray-600" htmlFor={`tx${i.id}`}>Tasa IVA</label>
                <input id={`tx${i.id}`} inputMode="decimal" className={input} value={rates[i.id]} onChange={(e) => setRates({ ...rates, [i.id]: e.target.value })} /></div>
              <div className="sm:col-span-2 text-right text-sm"><p className="text-xs text-gray-600">Importe</p><p className="pt-2 font-medium">{money(new Decimal(i.quantity).times(prices[i.id] || 0).toFixed(2))}</p></div>
            </div>
          ))}
        </div>
        <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(sub.toFixed(2))}</dd></div>
          <div className="flex justify-between"><dt>IVA</dt><dd>{money(tax.toFixed(2))}</dd></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd>{money(sub.plus(tax).toFixed(2))}</dd></div>
        </dl>
      </Card>
      <Feedback error={error} message={message} fieldErrors={fieldErrors} />
      <button className={btn.primary} disabled={pending || !supplierId || items.some((i) => !Number(prices[i.id]))}
        onClick={() => run({ requestId, supplierId, paymentTerms: terms, deliveryAddress: address, lines: items.map((i) => ({ requestItemId: i.id, unitPrice: prices[i.id], taxRate: rates[i.id] })) })}>
        {pending ? "Generando…" : "Generar orden de compra"}
      </button>
    </form>
  );
}
