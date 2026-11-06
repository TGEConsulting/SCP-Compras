"use client";
import { useState } from "react";
import { setSetting } from "@/server/actions/admin";
import { btn, input } from "./ui";
import { Feedback, useAction } from "./use-action";

export function SettingRow({ k, description, value }: { k: string; description: string; value: unknown }) {
  const [v, setV] = useState(JSON.stringify(value));
  const { run, pending, error, message } = useAction(setSetting);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium">{k}</p><p className="mb-2 text-xs text-gray-600">{description}</p>
      <div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor={k}>{k}</label><input id={k} className={`${input} max-w-xs`} value={v} onChange={(e) => setV(e.target.value)} />
        <button className={btn.secondary} disabled={pending} onClick={() => run({ key: k, valueJson: v })}>Guardar</button></div>
      <div className="mt-2"><Feedback error={error} message={message} /></div>
    </div>
  );
}
