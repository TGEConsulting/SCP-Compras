import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { AdminForm } from "@/components/admin-form";
import { Alert, Card, PageHeader, Table, Td } from "@/components/ui";
import { ActionButton } from "@/components/use-action";
import { db } from "@/db";
import { areas, roles, suppliers, userRoles, users } from "@/db/schema";
import { requirePage } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { setAreaHead, upsertUser } from "@/server/actions/admin";

export default async function Page({ searchParams }: { searchParams: { editar?: string; nuevo?: string } }) {
  await requirePage("admin:usuarios");
  const [list, areaRows, sups, rr] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)), db.select().from(areas).orderBy(asc(areas.name)), db.select().from(suppliers).orderBy(asc(suppliers.legalName)),
    db.select({ userId: userRoles.userId, code: roles.code }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)),
  ]);
  const rolesOf = (id: string) => rr.filter((r) => r.userId === id).map((r) => r.code);
  const editing = list.find((u) => u.id === searchParams.editar);
  const showForm = editing || searchParams.nuevo;
  return (
    <>
      <PageHeader title="Usuarios y roles" subtitle="Pre-registra el correo con el que la persona iniciará sesión." actions={<Link className="text-brand-600 underline" href="/admin/usuarios?nuevo=1">+ Nuevo usuario</Link>} />
      {showForm && <div className="mb-6"><AdminForm action={upsertUser} submitLabel="Guardar usuario" initial={{ userId: editing?.id ?? "", email: editing?.email ?? "", name: editing?.name ?? "", areaId: editing?.areaId ?? "", supplierId: editing?.supplierId ?? "", roles: editing ? rolesOf(editing.id) : [], active: editing?.active ?? true }}
        fields={[{ name: "name", label: "Nombre", type: "text" }, { name: "email", label: "Correo", type: "email" },
          { name: "areaId", label: "Área", type: "select", empty: "Sin área", options: areaRows.map((a) => ({ value: a.id, label: a.name })) },
          { name: "supplierId", label: "Proveedor (solo usuarios proveedor)", type: "select", empty: "No aplica", options: sups.map((s) => ({ value: s.id, label: s.legalName })) },
          { name: "roles", label: "Roles", type: "multi", options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "active", label: "Usuario activo", type: "checkbox" }]} /></div>}
      <Table head={["Nombre", "Correo", "Área", "Roles", "Estado", ""]}>
        {list.map((u) => <tr key={u.id}><Td>{u.name}</Td><Td>{u.email}</Td><Td>{areaRows.find((a) => a.id === u.areaId)?.name ?? "—"}</Td>
          <Td>{rolesOf(u.id).map((r) => ROLE_LABELS[r as keyof typeof ROLE_LABELS]).join(", ")}</Td><Td>{u.active ? (u.authId ? "Activo" : "Pendiente de primer ingreso") : "Inactivo"}</Td>
          <Td><Link className="text-brand-600 underline" href={`/admin/usuarios?editar=${u.id}`}>Editar</Link></Td></tr>)}
      </Table>
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">Jefe de cada área (aprueba solicitudes)</h2>
      <div className="space-y-2">
        {areaRows.map((a) => (
          <Card key={a.id}><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{a.name}</strong> · Jefe: {list.find((u) => u.id === a.headUserId)?.name ?? <span className="text-amber-800">sin asignar</span>}</span>
            <div className="flex flex-wrap gap-2">{list.filter((u) => u.active && rolesOf(u.id).includes("JEFE_AREA") && u.areaId === a.id && u.id !== a.headUserId).map((u) => <ActionButton key={u.id} action={setAreaHead} payload={{ areaId: a.id, headUserId: u.id }} variant="secondary" confirm={`¿Asignar a ${u.name} como jefe de ${a.name}?`}>Asignar a {u.name}</ActionButton>)}</div></div></Card>))}
      </div>
      <div className="mt-4"><Alert tone="blue">Para asignar un jefe, primero dale el rol «Jefe de área» y el área correspondiente.</Alert></div>
    </>
  );
}
