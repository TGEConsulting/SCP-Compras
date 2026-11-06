import Link from "next/link";
import type { ReactNode } from "react";

const TONES = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200", blue: "bg-blue-50 text-blue-800 ring-blue-200", green: "bg-green-50 text-green-800 ring-green-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-300", red: "bg-red-50 text-red-800 ring-red-200", purple: "bg-purple-50 text-purple-800 ring-purple-200",
} as const;

/** Etiqueta de estatus: color + texto (nunca solo color, para accesibilidad). */
export function StatusBadge({ def }: { def: { label: string; tone: keyof typeof TONES } | undefined }) {
  if (!def) return null;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[def.tone]}`}>{def.label}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>}
      {children}
    </section>
  );
}

export function Alert({ tone = "blue", title, children }: { tone?: "blue" | "amber" | "red" | "green"; title?: string; children: ReactNode }) {
  return (
    <div role="alert" className={`rounded-md p-4 text-sm ring-1 ring-inset ${TONES[tone]}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}{children}
    </div>
  );
}

export const btn = {
  primary: "inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
  danger: "inline-flex min-h-[44px] items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50",
};
export const input = "block w-full min-h-[44px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50";

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: keyof typeof btn }) {
  return <Link href={href} className={btn[variant]}>{children}</Link>;
}

/** Tabla con scroll horizontal en móvil. */
export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-gray-500">{empty}</p>}
    </div>
  );
}
export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;

export function Pagination({ page, hasNext, basePath, params }: { page: number; hasNext: boolean; basePath: string; params: Record<string, string | undefined> }) {
  const href = (p: number) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v) q.set(k, v); q.set("page", String(p)); return `${basePath}?${q}`; };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación">
      {page > 1 ? <Link className={btn.secondary} href={href(page - 1)}>← Anterior</Link> : <span />}
      <span className="text-gray-500">Página {page}</span>
      {hasNext ? <Link className={btn.secondary} href={href(page + 1)}>Siguiente →</Link> : <span />}
    </nav>
  );
}

/** Filtros por GET (búsqueda + estatus). Sin JS necesario. */
export function FilterBar({ action, q, status, statuses }: { action: string; q?: string; status?: string; statuses: Record<string, { label: string }> }) {
  return (
    <form action={action} className="mb-4 flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="q">Buscar</label>
      <input id="q" name="q" defaultValue={q} placeholder="Buscar por folio, título o proveedor…" className={`${input} max-w-sm flex-1`} />
      <label className="sr-only" htmlFor="status">Estatus</label>
      <select id="status" name="status" defaultValue={status ?? ""} className={`${input} w-auto`}>
        <option value="">Todos los estatus</option>
        {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <button className={btn.secondary} type="submit">Filtrar</button>
    </form>
  );
}

export function History({ rows }: { rows: { id: string; at: Date; userName: string | null; action: string; comment: string | null }[] }) {
  if (!rows.length) return <p className="text-sm text-gray-500">Sin movimientos registrados.</p>;
  return (
    <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
      {rows.map((r) => (
        <li key={r.id} className="text-sm">
          <p className="font-medium text-gray-900">{r.action.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</p>
          <p className="text-gray-500">{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(r.at)} · {r.userName ?? "Sistema"}</p>
          {r.comment && <p className="mt-0.5 text-gray-700">{r.comment}</p>}
        </li>
      ))}
    </ol>
  );
}
