import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Alert, btn } from "@/components/ui";

export default function NoAccess({ searchParams }: { searchParams: { motivo?: string } }) {
  const { userId } = auth();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <Alert tone="amber" title={searchParams.motivo === "permiso" ? "No tienes permiso para ver esta sección" : "Tu usuario aún no tiene acceso"}>
        {searchParams.motivo === "permiso" ? "Si crees que es un error, solicita a un administrador que revise tus roles." : "Tu correo no está registrado o está inactivo. Pide al administrador que te dé de alta con el mismo correo con el que iniciaste sesión."}
      </Alert>
      {userId && <SignOutButton><button className={btn.secondary}>Cerrar sesión</button></SignOutButton>}
    </main>
  );
}
