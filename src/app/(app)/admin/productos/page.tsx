import Link from "next/link";
import { asc } from "drizzle-orm";
import { AdminForm } from "@/components/admin-form";
import { PageHeader, Table, Td } from "@/components/ui";
import { db } from "@/db";
import { productCategories, products, unitsOfMeasure } from "@/db/schema";
import { requirePage } from "@/lib/auth";
import { upsertProduct } from "@/server/actions/admin";

export default async function Page({ searchParams }: { searchParams: { editar?: string; nuevo?: string } }) {
  await requirePage("admin:catalogos");
  const [list, uoms, cats] = await Promise.all([db.select().from(products).orderBy(asc(products.name)), db.select().from(unitsOfMeasure), db.select().from(productCategories)]);
  const e = list.find((p) => p.id === searchParams.editar);
  return (
    <>
      <PageHeader title="Productos" subtitle="Aquí se define la cadena fría y la temperatura máxima que valida la recepción." actions={<Link className="text-brand-600 underline" href="/admin/productos?nuevo=1">+ Nuevo producto</Link>} />
      {(e || searchParams.nuevo) && <div className="mb-6"><AdminForm action={upsertProduct} initial={{ productId: e?.id ?? "", sku: e?.sku ?? "", name: e?.name ?? "", uomId: e?.uomId ?? "", categoryId: e?.categoryId ?? "", requiresColdChain: e?.requiresColdChain ?? false, maxArrivalTempC: e?.maxArrivalTempC ?? "", requiresExpiryDate: e?.requiresExpiryDate ?? true, active: e?.active ?? true }}
        fields={[{ name: "sku", label: "SKU", type: "text" }, { name: "name", label: "Nombre", type: "text" },
          { name: "uomId", label: "Unidad de medida", type: "select", options: uoms.map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` })) },
          { name: "categoryId", label: "Categoría", type: "select", empty: "Sin categoría", options: cats.map((c) => ({ value: c.id, label: c.name })) },
          { name: "requiresColdChain", label: "Requiere cadena fría", type: "checkbox" }, { name: "maxArrivalTempC", label: "Temperatura máxima de llegada (°C)", type: "text" },
          { name: "requiresExpiryDate", label: "Exige fecha de caducidad", type: "checkbox" }, { name: "active", label: "Activo", type: "checkbox" }]} /></div>}
      <Table head={["SKU", "Producto", "Unidad", "Cadena fría", "Activo", ""]}>
        {list.map((p) => <tr key={p.id}><Td>{p.sku}</Td><Td>{p.name}</Td><Td>{uoms.find((u) => u.id === p.uomId)?.code}</Td><Td>{p.requiresColdChain ? `≤ ${p.maxArrivalTempC} °C` : "No"}</Td><Td>{p.active ? "Sí" : "No"}</Td>
          <Td><Link className="text-brand-600 underline" href={`/admin/productos?editar=${p.id}`}>Editar</Link></Td></tr>)}
      </Table>
    </>
  );
}
