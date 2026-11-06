"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/action";
import { Alert, btn, input } from "./ui";

type Fn<T> = (raw: unknown) => Promise<ActionResult<T>>;

/** Ejecuta una Server Action, maneja errores de validación/negocio y refresca la pantalla. */
export function useAction<T>(fn: Fn<T>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  function run(payload: unknown, opts?: { onOk?: (r: Extract<ActionResult<T>, { ok: true }>) => void }) {
    setError(null); setFieldErrors({}); setMessage(null);
    start(async () => {
      let res: ActionResult<T>;
      try { res = await fn(payload); } catch { res = { ok: false, error: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo." }; }
      if (!res.ok) { setError(res.error); setFieldErrors(res.fieldErrors ?? {}); return; }
      setMessage(res.message ?? null);
      opts?.onOk?.(res);
      if (res.redirectTo) router.push(res.redirectTo); else router.refresh();
    });
  }
  return { run, pending, error, fieldErrors, message };
}

/** FormData con `payload` JSON + archivos (el servidor valida tipo real y tamaño). */
export function withFiles(payload: unknown, files: Record<string, File[]>) {
  const fd = new FormData();
  fd.set("payload", JSON.stringify(payload));
  for (const [k, list] of Object.entries(files)) for (const f of list) fd.append(k, f);
  return fd;
}

export function Feedback({ error, message, fieldErrors }: { error: string | null; message: string | null; fieldErrors?: Record<string, string[]> }) {
  const extra = fieldErrors ? Object.entries(fieldErrors).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`)) : [];
  return (
    <div aria-live="polite" className="space-y-2">
      {error && <Alert tone="red">{error}{extra.length > 0 && <ul className="mt-1 list-disc pl-5">{extra.map((e) => <li key={e}>{e}</li>)}</ul>}</Alert>}
      {message && !error && <Alert tone="green">{message}</Alert>}
    </div>
  );
}

/** Botón que ejecuta una acción con payload fijo; opcionalmente pide confirmación o un motivo obligatorio. */
export function ActionButton<T>({ action, payload, children, variant = "primary", confirm, reasonLabel, reasonField = "reason", minReason = 5 }: {
  action: Fn<T>; payload: Record<string, unknown>; children: React.ReactNode; variant?: keyof typeof btn;
  confirm?: string; reasonLabel?: string; reasonField?: string; minReason?: number;
}) {
  const { run, pending, error, message } = useAction(action);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!reasonLabel && !confirm) {
    return (<span className="inline-flex flex-col gap-1">
      <button className={btn[variant]} disabled={pending} onClick={() => run(payload)}>{pending ? "Procesando…" : children}</button>
      <Feedback error={error} message={message} />
    </span>);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button className={btn[variant]} disabled={pending} onClick={() => setOpen(true)}>{children}</button>
      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl">
            <p className="text-sm text-gray-800">{confirm ?? reasonLabel}</p>
            {reasonLabel && <textarea className={input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonLabel} aria-label={reasonLabel} />}
            <Feedback error={error} message={null} />
            <div className="flex justify-end gap-2">
              <button className={btn.secondary} onClick={() => setOpen(false)}>Cancelar</button>
              <button className={btn[variant]} disabled={pending || (!!reasonLabel && reason.trim().length < minReason)}
                onClick={() => run({ ...payload, ...(reasonLabel ? { [reasonField]: reason } : {}) }, { onOk: () => setOpen(false) })}>
                {pending ? "Procesando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {!open && <Feedback error={null} message={message} />}
    </span>
  );
}
