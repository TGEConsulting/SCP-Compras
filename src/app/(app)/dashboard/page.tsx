import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/auth";
import { dashboardCounts } from "@/server/queries";

export default async function Dashboard() {
  const s = await requirePage();
  if (s.isSupplier && s.roles.length === 1) redirect("/proveedor");
  const cards = await dashboardCounts(s);
  return (
    <>
      <PageHeader title={`Hola, ${s.name.split(" ")[0]}`} subtitle="Esto es lo que está esperando tu atención."
        actions={s.permissions.has("solicitud:crear") ? <LinkButton href="/solicitudes/nueva">Nueva solicitud</LinkButton> : undefined} />
      {cards.length === 0 ? <Card>No hay tableros para tu rol todavía.</Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.label} href={c.href} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-brand-500">
              <p className="text-3xl font-semibold text-brand-700">{c.value}</p>
              <p className="mt-1 text-sm text-gray-700">{c.label}</p>
              {c.hint && <p className="text-xs text-amber-800">{c.hint}</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
