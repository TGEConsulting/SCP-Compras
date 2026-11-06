import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rutas públicas mínimas. El resto exige sesión; la autorización fina se valida en servidor (lib/auth.ts).
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sin-acceso(.*)", "/api/cron/(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (!isPublic(req)) auth().protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
