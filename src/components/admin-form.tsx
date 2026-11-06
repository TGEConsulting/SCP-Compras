"use client";
import { useState } from "react";
import { Card, btn, input } from "./ui";
import { Feedback, useAction } from "./use-action";
import type { ActionResult } from "@/server/action";

export type Field =
  | { name: string; label: string; type: "text" | "email" | "date"; hint?: string }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; empty?: string }
  | { name: string; label: string; type: "checkbox" }
  | { name: string; label: string; type: "multi"; options: { value: string; label: string }[] };

/** Formulario genérico de administración: el servidor valida con Zod y devuelve errores por campo. */
export function AdminForm({ action, fields, initial, submitLabel = "Guardar" }: {
  action: (raw: unknown) => Promise<ActionResult<void>>; fields: Field[]; initial: Record<string, unknown>; submitLabel?: string;
}) {
  const [v, setV] = useState<Record<string, unknown>>(initial);
  const { run, pending, error, fieldErrors, message } = useAction(action);
  const set = (k: string, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Card>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(v); }}>
        {fields.map((f) => (
          <div key={f.name} className={f.type === "multi" ? "sm:col-span-2" : ""}>
            {f.type === "checkbox" ? (
              <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={!!v[f.name]} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}</label>
            ) : f.type === "multi" ? (
              <fieldset><legend className="mb-1 text-sm font-medium">{f.label}</legend>
                <div className="flex flex-wrap gap-3">{f.options.map((o) => { const cur = (v[f.name] as string[]) ?? []; return (
                  <label key={o.value} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={cur.includes(o.value)} onChange={(e) => set(f.name, e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value))} /> {o.label}</label>); })}</div></fieldset>
            ) : (<>
              <label className="mb-1 block text-sm font-medium" htmlFor={f.name}>{f.label}</label>
              {f.type === "select" ? (
                <select id={f.name} className={input} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">{f.empty ?? "Selecciona…"}</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              ) : <input id={f.name} type={f.type} className={input} value={String(v[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />}
            </>)}
            {fieldErrors[f.name]?.map((m) => <p key={m} className="mt-1 text-xs text-red-700">{m}</p>)}
          </div>
        ))}
        <div className="space-y-2 sm:col-span-2"><Feedback error={error} message={message} />
          <button className={btn.primary} disabled={pending}>{pending ? "Guardando…" : submitLabel}</button></div>
      </form>
    </Card>
  );
}
