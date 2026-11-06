"use client";
import { useState } from "react";
import { saveRequest } from "@/server/actions/requests";
import { saveRequestSchema } from "@/lib/validators";
import { Card, btn, input } from "./ui";
import { Feedback, useAction } from "./use-action";

type Product = { id: string; sku: string; name: string; uom: string };
type Row = { productId: string; quantity: string; description: string; estimatedUnitPrice: string };
type Initial = { requestId?: string; title: string; justification: string; costCenterId: string; neededBy: string; items: Row[] };

export function RequestForm({ products, costCenters, initial }: { products: Product[]; costCenters: { id: string; code: string; name: string }[]; initial?: Initial }) {
  const [f, setF] = useState<Omit<Initial, "items">>({ requestId: initial?.requestId, title: initial?.title ?? "", justification: initial?.justification ?? "", costCenterId: initial?.costCenterId ?? "", neededBy: initial?.neededBy ?? "" });
  const [rows, setRows] = useState<Row[]>(initial?.items?.length ? initial.items : [{ productId: "", quantity: "", description: "", estimatedUnitPrice: "" }]);
  const [touched, setTouched] = useState(false);
  const { run, pending, error, fieldErrors, message } = useAction(saveRequest);

  const payload = (submit: boolean) => ({ ...f, items: rows, submit });
  // Validación en tiempo real con el MISMO esquema que usa el servidor
  const live = touched ? saveRequestSchema.safeParse(payload(false)) : null;
  const liveErrors = live && !live.success ? live.error.flatten() : null;
  const uom = (id: string) => products.find((p) => p.id === id)?.uom ?? "";
  const upd = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()} noValidate>
      <Card title="Datos de la solicitud">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="title">¿Qué necesitas?</label>
            <input id="title" className={input} value={f.title} onChange={(e) => { setTouched(true); setF({ ...f, title: e.target.value }); }} placeholder="Ej. Cultivo láctico para producción de queso" />
            {liveErrors?.fieldErrors.title && <p className="mt-1 text-xs text-red-700">{liveErrors.fieldErrors.title[0]}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="just">Motivo / justificación</label>
            <textarea id="just" rows={3} className={input} value={f.justification} onChange={(e) => { setTouched(true); setF({ ...f, justification: e.target.value }); }} />
            {liveErrors?.fieldErrors.justification && <p className="mt-1 text-xs text-red-700">{liveErrors.fieldErrors.justification[0]}</p>}
          </div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="cc">Centro de costos</label>
            <select id="cc" className={input} value={f.costCenterId} onChange={(e) => setF({ ...f, costCenterId: e.target.value })}>
              <option value="">Sin especificar</option>{costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="need">Fecha requerida</label>
            <input id="need" type="date" className={input} value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} /></div>
        </div>
      </Card>

      <Card title="Productos">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-12">
              <div className="sm:col-span-6"><label className="mb-1 block text-xs font-medium text-gray-600" htmlFor={`p${i}`}>Producto</label>
                <select id={`p${i}`} className={input} value={r.productId} onChange={(e) => { setTouched(true); upd(i, { productId: e.target.value }); }}>
                  <option value="">Selecciona…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                </select></div>
              <div className="sm:col-span-3"><label className="mb-1 block text-xs font-medium text-gray-600" htmlFor={`q${i}`}>Cantidad {uom(r.productId) && `(${uom(r.productId)})`}</label>
                <input id={`q${i}`} inputMode="decimal" className={input} value={r.quantity} onChange={(e) => { setTouched(true); upd(i, { quantity: e.target.value }); }} /></div>
              <div className="sm:col-span-3"><label className="mb-1 block text-xs font-medium text-gray-600" htmlFor={`e${i}`}>Precio estimado (opc.)</label>
                <input id={`e${i}`} inputMode="decimal" className={input} value={r.estimatedUnitPrice} onChange={(e) => upd(i, { estimatedUnitPrice: e.target.value })} /></div>
              <div className="sm:col-span-12"><label className="sr-only" htmlFor={`d${i}`}>Notas</label>
                <input id={`d${i}`} className={input} placeholder="Notas o especificación (opcional)" value={r.description} onChange={(e) => upd(i, { description: e.target.value })} /></div>
              {rows.length > 1 && <div className="sm:col-span-12"><button type="button" className="text-sm text-red-700 underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Quitar producto</button></div>}
            </div>
          ))}
          {liveErrors?.fieldErrors.items && <p className="text-xs text-red-700">Revisa que cada producto tenga una cantidad válida mayor a 0.</p>}
          <button type="button" className={btn.secondary} onClick={() => setRows([...rows, { productId: "", quantity: "", description: "", estimatedUnitPrice: "" }])}>+ Agregar producto</button>
        </div>
      </Card>

      <Feedback error={error} message={message} fieldErrors={fieldErrors} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} disabled={pending} onClick={() => run(payload(false))}>Guardar borrador</button>
        <button type="button" className={btn.primary} disabled={pending} onClick={() => run(payload(true))}>{pending ? "Enviando…" : "Enviar a mi jefe de área"}</button>
      </div>
    </form>
  );
}
