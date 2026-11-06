"use client";
import { useState } from "react";
import { authorizePayment, registerPayment } from "@/server/actions/payments";
import { confirmOrder, markInTransit, uploadOrderDocument } from "@/server/actions/orders";
import { uploadInvoice } from "@/server/actions/invoices";
import { Card, btn, input } from "./ui";
import { Feedback, useAction, withFiles } from "./use-action";

export function ConfirmOrderPanel({ orderId }: { orderId: string }) {
  const [date, setDate] = useState("");
  const [guia, setGuia] = useState("");
  const { run, pending, error, fieldErrors, message } = useAction(confirmOrder);
  return (
    <Card title="Confirmar orden">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium" htmlFor="fc">Fecha compromiso de entrega</label><input id="fc" type="date" min={new Date().toISOString().slice(0, 10)} className={input} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="mb-1 block text-sm font-medium" htmlFor="gu">No. de guía (opcional)</label><input id="gu" className={input} value={guia} onChange={(e) => setGuia(e.target.value)} /></div>
      </div>
      <div className="mt-3 space-y-2"><Feedback error={error} message={message} fieldErrors={fieldErrors} />
        <button className={btn.primary} disabled={pending || !date} onClick={() => run({ orderId, promisedDate: date, trackingNumber: guia })}>{pending ? "Confirmando…" : "Confirmar orden"}</button></div>
    </Card>
  );
}

export function InTransitPanel({ orderId, current }: { orderId: string; current: string | null }) {
  const [guia, setGuia] = useState(current ?? "");
  const { run, pending, error, message } = useAction(markInTransit);
  return (
    <Card title="Envío">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><label className="mb-1 block text-sm font-medium" htmlFor="gt">No. de guía</label><input id="gt" className={input} value={guia} onChange={(e) => setGuia(e.target.value)} /></div>
        <button className={btn.secondary} disabled={pending || guia.trim().length < 3} onClick={() => run({ orderId, trackingNumber: guia })}>Marcar en tránsito</button>
      </div>
      <div className="mt-2"><Feedback error={error} message={message} /></div>
    </Card>
  );
}

export function InvoiceUploadPanel({ orderId, blockedHint }: { orderId: string; blockedHint?: string }) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const { run, pending, error, fieldErrors, message } = useAction(uploadInvoice);
  return (
    <Card title="Cargar factura">
      {blockedHint && <p className="mb-3 text-sm text-gray-600">{blockedHint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium" htmlFor="pdf">Factura PDF</label><input id="pdf" type="file" accept="application/pdf" className="block w-full text-sm" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} /></div>
        <div><label className="mb-1 block text-sm font-medium" htmlFor="xml">Factura XML (CFDI timbrado)</label><input id="xml" type="file" accept=".xml,text/xml,application/xml" className="block w-full text-sm" onChange={(e) => setXml(e.target.files?.[0] ?? null)} /></div>
      </div>
      <p className="mt-2 text-xs text-gray-500">El sistema lee el XML (UUID, RFC, importes y conceptos) y lo concilia con tu orden y la recepción. No necesitas capturar datos.</p>
      <div className="mt-3 space-y-2"><Feedback error={error} message={message} fieldErrors={fieldErrors} />
        <button className={btn.primary} disabled={pending || !pdf || !xml} onClick={() => run(withFiles({ orderId }, { pdf: pdf ? [pdf] : [], xml: xml ? [xml] : [] }))}>{pending ? "Cargando y validando…" : "Cargar factura"}</button></div>
    </Card>
  );
}

export function OrderDocPanel({ orderId }: { orderId: string }) {
  const [kind, setKind] = useState("REMISION");
  const [file, setFile] = useState<File | null>(null);
  const { run, pending, error, message } = useAction(uploadOrderDocument);
  return (
    <Card title="Remisión, acuse, guía o fichas">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium" htmlFor="dk">Tipo de documento</label>
          <select id="dk" className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="REMISION">Remisión</option><option value="ACUSE">Acuse</option><option value="GUIA">Guía</option><option value="COTIZACION">Cotización</option><option value="FICHA_TECNICA">Ficha técnica</option></select></div>
        <div><label className="mb-1 block text-sm font-medium" htmlFor="df">Archivo (PDF o imagen)</label><input id="df" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <div className="mt-3 space-y-2"><Feedback error={error} message={message} />
        <button className={btn.secondary} disabled={pending || !file} onClick={() => run(withFiles({ orderId, kind }, { file: file ? [file] : [] }))}>Subir documento</button></div>
    </Card>
  );
}

export function PaymentPanel({ invoiceId, paymentId }: { invoiceId: string; paymentId: string | null }) {
  const auth = useAction(authorizePayment);
  const reg = useAction(registerPayment);
  const [ref, setRef] = useState("");
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  const [proof, setProof] = useState<File | null>(null);
  if (!paymentId) {
    return (<div className="space-y-2"><Feedback error={auth.error} message={auth.message} />
      <button className={btn.primary} disabled={auth.pending} onClick={() => auth.run({ invoiceId })}>{auth.pending ? "Validando…" : "Autorizar pago"}</button></div>);
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="mb-1 block text-sm font-medium" htmlFor="ref">Referencia bancaria</label><input id="ref" className={input} value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <div><label className="mb-1 block text-sm font-medium" htmlFor="pd">Fecha de pago</label><input id="pd" type="date" className={input} value={d} onChange={(e) => setD(e.target.value)} /></div>
        <div><label className="mb-1 block text-sm font-medium" htmlFor="pf">Comprobante</label><input id="pf" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm" onChange={(e) => setProof(e.target.files?.[0] ?? null)} /></div>
      </div>
      <Feedback error={reg.error} message={reg.message} fieldErrors={reg.fieldErrors} />
      <button className={btn.primary} disabled={reg.pending || ref.trim().length < 3} onClick={() => reg.run(withFiles({ paymentId, reference: ref, paymentDate: d }, { comprobante: proof ? [proof] : [] }))}>{reg.pending ? "Registrando…" : "Registrar pago"}</button>
    </div>
  );
}
