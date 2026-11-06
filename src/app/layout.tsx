import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Compras · La Quinta", description: "Gestión de compras y comunicación con proveedores — Productos Lácteos La Quinta" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={esES}>
      <html lang="es-MX"><body>{children}</body></html>
    </ClerkProvider>
  );
}
