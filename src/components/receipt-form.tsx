"use client";
import { useState } from "react";
import { registerReceipt } from "@/server/actions/receipts";
import { qtyFmt } from "@/lib/format";
import { Alert, Card, btn, input } from "./ui";
import { Feedback, useAction, withFiles } from "./use-action";

export type ReceiptLine = {
  id: string; description: string; sku: string; uom: string; ordered: string; received: string; pending: string;
  coldChain: boolean; maxTemp: string | null; needsExpiry: boolean;
};
type S = {
  received: string; accepted: string; rejected: string; lot: string; expiry: string; temp: string;
  packaging: "" | "INTEGRO" | "DANADO_LEVE" | "DANADO_GRAVE"; result: "CONFORME" | "CONDICIONADO" | "RECHAZADO"; reason: string; action: string; obs: string; photos: File[];
};
const empty = (pending: string): S => ({ received: "", accepted: pending, rejected: "0", lot: "", expiry: "", temp: "", packaging: "", result: "CONFORME", reason: "", action: "", obs: "", photos: [] });
const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? NaN : Number(v));

/** `invoiceExists` viene del servidor al abrir la pantalla; el servidor lo vuelve a verificar al guardar. */
export function ReceiptForm({ orderId, lines, invoiceExists, warning, tracking }: { orderId: string; lines: ReceiptLine[]; invoiceExists: boolean; warning: string; tracking: string | null }) {
  const [s, setS] = useState<Record<string, S>>(Object.fromEntries(lines.map((l) => [l.id, empty(l.pending)])));
  const [head, setHead] = useState({ trackingNumber: tracking ?? "", supplierDeliveryNote: "", observations: "" });
  const { run, pending, error, fieldErrors, message } = useAction(registerReceipt);
  const set = (id: string, p: Partial<S>) => setS((x) => ({ ...x, [id]: { ...x[id]!, ...p } }));

  /** Al capturar recibido/rechazado se calcula aceptado = recibido − rechazado (el usuario puede ajustarlo). */
  const setQty = (id: string, p: Partial<Pick<S, "received" | "rejected">>) => {
    const cur = { ...s[id]!, ...p };
    const acc = num(cur.received) - (num(cur.rejected) || 0);
    set(id, { ...p, accepted: isNaN(acc) || acc < 0 ? "" : String(+acc.toFixed(3)), result: (num(cur.rejected) || 0) > 0 && cur.result === "CONFORME" ? "CONDICIONADO" : cur.result });
  };

  const problems: string[] = [];
  const active = lines.filter((l) => num(s[l.id]!.received) > 0);
  for (const l of active) {
    const v = s[l.id]!;
    const r = num(v.received), a = num(v.accepted), j = num(v.rejected);
    if (Math.abs(r - (a + j)) > 0.0005) problems.push(`${l.description}: recibido debe ser aceptado + rechazado.`);
    if (r > Number(l.pending) * 1.0 + 1e-9) problems.push(`${l.description}: excede lo pendiente (${qtyFmt(l.pending)}).`);
    if (!v.lot) problems.push(`${l.description}: falta el lote.`);
    if (l.needsExpiry && !v.expiry) problems.push(`${l.description}: falta la caducidad.`);
    if (l.coldChain && !v.temp) problems.push(`${l.description}: falta la temperatura de llegada.`);
    if (l.coldChain && v.temp && l.maxTemp && Number(v.temp) > Number(l.maxTemp) && v.result === "CONFORME") problems.push(`${l.description}: ${v.temp} °C excede el máximo ${l.maxTemp} °C.`);
    if (!v.packaging) problems.push(`${l.description}: indica la condición del empaque.`);
    if (j > 0 && (!v.reason || !v.action)) problems.push(`${l.description}: el rechazo requiere motivo y acción correctiva.`);
    if (j > 0 && v.photos.length === 0) problems.push(`${l.description}: sube al menos una foto (obligatoria en rechazos).`);
  }
  const valid = active.length > 0 && problems.length === 0;

  function submit(mode: "PENDIENTE_FACTURA" | "FINALIZAR") {
    const items = active.map((l) => { const v = s[l.id]!; return {
      orderItemId: l.id, received: v.received, accepted: v.accepted, rejected: v.rejected || "0", supplierLot: v.lot, expiryDate: v.expiry, arrivalTempC: v.temp,
      packagingCondition: v.packaging || undefined, inspectionResult: v.result, rejectionReason: v.reason, correctiveAction: v.action, observations: v.obs,
    }; });
    const files: Record<string, File[]> = {};
    for (const l of active) files[`foto:${l.id}`] = s[l.id]!.photos;
    run(withFiles({ orderId, mode, ...head, items }, files));
  }

  return (
    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
      <Card title="Datos de la entrega">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="mb-1 block text-sm font-medium" htmlFor="guia">No. de guía</label><input id="guia" className={input} value={head.trackingNumber} onChange={(e) => setHead({ ...head, trackingNumber: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="rem">Remisión del proveedor</label><input id="rem" className={input} value={head.supplierDeliveryNote} onChange={(e) => setHead({ ...head, supplierDeliveryNote: e.target.value })} /></div>
          <div><label className="mb-1 block text-sm font-medium" htmlFor="obsg">Observaciones</label><input id="obsg" className={input} value={head.observations} onChange={(e) => setHead({ ...head, observations: e.target.value })} /></div>
        </div>
      </Card>

      {lines.map((l) => {
        const v = s[l.id]!;
        const rej = num(v.rejected) > 0;
        return (
          <Card key={l.id}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div><p className="font-medium">{l.description}</p><p className="text-xs text-gray-500">{l.sku} · Ordenado {qtyFmt(l.ordered)} {l.uom} · Ya recibido {qtyFmt(l.received)} · <strong>Pendiente {qtyFmt(l.pending)}</strong></p></div>
              {l.coldChain && <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-800 ring-1 ring-blue-200">Cadena fría{l.maxTemp ? ` ≤ ${l.maxTemp} °C` : ""}</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-6">
              <Field label={`Recibida (${l.uom})`} id={`r${l.id}`}><input id={`r${l.id}`} inputMode="decimal" className={input} value={v.received} onChange={(e) => setQty(l.id, { received: e.target.value })} /></Field>
              <Field label="Aceptada" id={`a${l.id}`}><input id={`a${l.id}`} inputMode="decimal" className={input} value={v.accepted} onChange={(e) => set(l.id, { accepted: e.target.value })} /></Field>
              <Field label="Rechazada" id={`x${l.id}`}><input id={`x${l.id}`} inputMode="decimal" className={input} value={v.rejected} onChange={(e) => setQty(l.id, { rejected: e.target.value })} /></Field>
              <Field label="Lote del proveedor" id={`l${l.id}`}><input id={`l${l.id}`} className={input} value={v.lot} onChange={(e) => set(l.id, { lot: e.target.value })} /></Field>
              <Field label={l.needsExpiry ? "Caducidad" : "Caducidad (opc.)"} id={`e${l.id}`}><input id={`e${l.id}`} type="date" className={input} value={v.expiry} onChange={(e) => set(l.id, { expiry: e.target.value })} /></Field>
              <Field label={l.coldChain ? "Temp. llegada °C" : "Temp. °C (opc.)"} id={`t${l.id}`}><input id={`t${l.id}`} inputMode="decimal" className={input} value={v.temp} onChange={(e) => set(l.id, { temp: e.target.value })} /></Field>
              <Field label="Condición del empaque" id={`p${l.id}`}>
                <select id={`p${l.id}`} className={input} value={v.packaging} onChange={(e) => set(l.id, { packaging: e.target.value as S["packaging"] })}>
                  <option value="">Selecciona…</option><option value="INTEGRO">Íntegro</option><option value="DANADO_LEVE">Daño leve</option><option value="DANADO_GRAVE">Daño grave</option></select></Field>
              <Field label="Resultado de inspección" id={`i${l.id}`}>
                <select id={`i${l.id}`} className={input} value={v.result} onChange={(e) => set(l.id, { result: e.target.value as S["result"] })}>
                  <option value="CONFORME">Conforme</option><option value="CONDICIONADO">Condicionado</option><option value="RECHAZADO">Rechazado</option></select></Field>
            </div>
            {rej && (
              <div className="mt-3 grid gap-3 rounded-md bg-red-50 p-3 sm:grid-cols-2">
                <Field label="Motivo del rechazo" id={`m${l.id}`}><input id={`m${l.id}`} className={input} value={v.reason} onChange={(e) => set(l.id, { reason: e.target.value })} /></Field>
                <Field label="Acción correctiva solicitada" id={`c${l.id}`}><input id={`c${l.id}`} className={input} value={v.action} onChange={(e) => set(l.id, { action: e.target.value })} /></Field>
                <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium" htmlFor={`f${l.id}`}>Evidencias fotográficas (obligatorias) *</label>
                  <input id={`f${l.id}`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => set(l.id, { photos: Array.from(e.target.files ?? []) })} className="block w-full text-sm" />
                  {v.photos.length > 0 && <p className="mt-1 text-xs text-gray-600">{v.photos.length} foto(s) seleccionada(s)</p>}</div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Mensaje claro sobre el impacto en el pago */}
      {invoiceExists
        ? <Alert tone="green" title="Factura cargada por el proveedor">Al finalizar, el sistema conciliará automáticamente orden, recepción aceptada y factura. Las cantidades rechazadas no se pagan.</Alert>
        : <Alert tone="amber" title="Factura no cargada">{warning}</Alert>}
      {active.length > 0 && problems.length > 0 && <Alert tone="red" title="Falta por corregir"><ul className="list-disc pl-5">{problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul></Alert>}
      <Feedback error={error} message={message} fieldErrors={fieldErrors} />

      <div className="flex flex-wrap gap-2">
        {!invoiceExists && <button type="button" className={btn.primary} disabled={!valid || pending} onClick={() => submit("PENDIENTE_FACTURA")}>{pending ? "Guardando…" : "Guardar recepción como PENDIENTE_FACTURA"}</button>}
        {invoiceExists && <button type="button" className={btn.primary} disabled={!valid || pending} onClick={() => submit("FINALIZAR")}>{pending ? "Finalizando…" : "Finalizar recepción"}</button>}
      </div>
    </form>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-medium text-gray-600" htmlFor={id}>{label}</label>{children}</div>;
}
