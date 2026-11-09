import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { ROLE_LABELS, type Permission } from "@/lib/permissions";

const NAV: { href: string; label: string; any: Permission[] }[] = [
  { href: "/dashboard", label: "Inicio", any: ["solicitud:crear", "oc:ver_todas", "pago:ver", "admin:catalogos"] },
  { href: "/solicitudes", label: "Solicitudes", any: ["solicitud:crear", "solicitud:ver_todas", "solicitud:decidir"] },
  { href: "/ordenes", label: "Órdenes de compra", any: ["oc:ver_todas"] },
  { href: "/recepcion", label: "Recepción", any: ["recepcion:registrar", "recepcion:ver"] },
  { href: "/facturas", label: "Facturas", any: ["factura:ver_todas"] },
  { href: "/seguimiento", label: "Seguimiento", any: ["factura:ver_todas"] },
  { href: "/pagos", label: "Pagos", any: ["pago:ver"] },
  { href: "/admin", label: "Administración", any: ["admin:usuarios", "admin:catalogos"] },
  { href: "/proveedor", label: "Mis órdenes", any: ["proveedor:portal"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage();
  // Ocultar enlaces es solo comodidad: cada página y acción vuelve a validar permisos en servidor.
  const links = NAV.filter((n) => n.any.some((p) => s.permissions.has(p)));
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-semibold text-brand-700">La Quinta · Compras</Link>
          <div className="flex items-center gap-3 text-sm"><span className="hidden text-gray-600 sm:inline">{s.name} · {s.roles.map((r) => ROLE_LABELS[r]).join(", ")}</span><UserButton /></div>
        </div>
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {links.map((l) => <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">{l.label}</Link>)}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
