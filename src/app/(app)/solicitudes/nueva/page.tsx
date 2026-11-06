import { PageHeader } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { requirePage } from "@/lib/auth";
import { catalogCostCenters, catalogProducts } from "@/server/queries";

export default async function Page() {
  await requirePage("solicitud:crear");
  const [products, costCenters] = await Promise.all([catalogProducts(), catalogCostCenters()]);
  return (<><PageHeader title="Nueva solicitud de compra" subtitle="Indica qué necesitas y para qué. Tu jefe de área la revisará." /><RequestForm products={products} costCenters={costCenters} /></>);
}
