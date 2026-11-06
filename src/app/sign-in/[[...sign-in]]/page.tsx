import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="text-center"><h1 className="text-2xl font-semibold text-brand-700">Productos Lácteos La Quinta</h1><p className="text-sm text-gray-600">Compras y proveedores</p></div>
      <SignIn />
    </main>
  );
}
