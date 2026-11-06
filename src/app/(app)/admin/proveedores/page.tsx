import Link from "next/link";
import { asc } from "drizzle-orm";
import { AdminForm } from "@/components/admin-form";
import { PageHeader, Table, Td } from "@/components/ui";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requirePage } from "@/lib/auth";
import { date } from "@/lib/format";
import { upsertSupplier } from "@/server/actions/admin";

export default async function Page({ searchParams }: { searchParams: { editar?: string; nuevo?: string } }) {
  await requirePage("admin:catalogos");
  const list = await db.select().from(suppliers).orderBy(asc(suppliers.legalName));
  const e = list.find((s) => s.id === searchParams.editar);
  return (
    <>
      <PageHeader title="Proveedores" subtitle="Solo «Autorizado» con documentación vigente puede recibir órdenes y facturar." actions={<Link className="text-brand-600 underline" href="/admin/proveedores?nuevo=1">+ Nuevo proveedor</Link>} />
      {(e || searchParams.nuevo) && <div className="mb-6"><AdminForm action={upsertSupplier} initial={{ supplierId: e?.id ?? "", code: e?.code ?? "", rfc: e?.rfc ?? "", legalName: e?.legalName ?? "", email: e?.email ?? "", status: e?.status ?? "PENDIENTE", documentsValidUntil: e?.documentsValidUntil ?? "" }}
        fields={[{ name: "code", label: "Código", type: "text" }, { name: "rfc", label: "RFC", type: "text" }, { name: "legalName", label: "Razón social", type: "text" }, { name: "email", label: "Correo de contacto", type: "email" },
          { name: "status", label: "Estatus", type: "select", options: ["PENDIENTE", "AUTORIZADO", "SUSPENDIDO", "BAJA"].map((x) => ({ value: x, label: x.charAt(0) + x.slice(1).toLowerCase() })) },
          { name: "documentsValidUntil", label: "Documentación vigente hasta", type: "date" }]} /></div>}
      <Table head={["Código", "Razón social", "RFC", "Estatus", "Documentos vigentes hasta", ""]}>
        {list.map((s) => <tr key={s.id}><Td>{s.code}</Td><Td>{s.legalName}</Td><Td>{s.rfc}</Td><Td>{s.status}</Td>
          <Td className={s.documentsValidUntil && s.documentsValidUntil < new Date().toISOString().slice(0, 10) ? "font-medium text-red-700" : ""}>{date(s.documentsValidUntil)}</Td>
          <Td><Link className="text-brand-600 underline" href={`/admin/proveedores?editar=${s.id}`}>Editar</Link></Td></tr>)}
      </Table>
    </>
  );
}
