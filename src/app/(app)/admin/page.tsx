import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requirePage } from "@/lib/auth";

export default async function Page() {
  const s = await requirePage(["admin:usuarios", "admin:catalogos"]);
  const items = [
    { href: "/admin/usuarios", label: "Usuarios y roles", p: "admin:usuarios" }, { href: "/admin/proveedores", label: "Proveedores", p: "admin:catalogos" },
    { href: "/admin/productos", label: "Productos", p: "admin:catalogos" }, { href: "/admin/parametros", label: "Parámetros (tolerancias, RFC, plazos)", p: "admin:catalogos" },
  ].filter((i) => s.permissions.has(i.p as never));
  return (<><PageHeader title="Administración" /><div className="grid gap-3 sm:grid-cols-2">{items.map((i) => <Link key={i.href} href={i.href}><Card className="hover:border-brand-500">{i.label}</Card></Link>)}</div></>);
}
