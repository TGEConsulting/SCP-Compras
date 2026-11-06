---
name: seguridad-y-roles
description: Control de acceso por roles y permisos, aislamiento por proveedor, protección de Server Actions, archivos privados y secretos. Úsalo al agregar rutas, acciones, consultas o roles.
---

# Seguridad y roles

## Instrucciones
- Autenticación: Clerk (solo identidad). Autorización: **siempre en servidor**, desde `user_roles` en BD → `src/lib/permissions.ts`.
- Pide **permisos**, no roles. Páginas: `requirePage(permiso)`. Acciones: `defineAction({ permission, schema })`.
- Ocultar un botón es cortesía; el control real es la acción/consulta.

## Matriz resumida
| Rol | Puede |
|-----|-------|
| Solicitante | Crear/editar/enviar **sus** solicitudes |
| Jefe de área | Además aprobar/rechazar/devolver solicitudes **de su área** |
| Compras | Generar y enviar OC; autorizar diferencias de factura |
| Almacén / Calidad | Registrar recepciones e inspecciones |
| Finanzas | Autorizar y registrar pagos; autorizar diferencias |
| Proveedor | Solo **sus** OC, documentos y facturas |
| Administrador | Catálogos, usuarios, roles, parámetros |

## Reglas
1. **Autorización por objeto** (anti-IDOR): cada lectura/escritura filtra por el alcance de la sesión (`orderScope`, `requestScope`, `invoiceScope`; `po.supplierId === session.supplierId`). Objeto ajeno → «no encontrado», sin revelar existencia.
2. Aislamiento por proveedor: **validación estricta por consulta** en el MVP; RLS de Postgres queda como defensa adicional (iteración 2, requiere rol de BD por solicitud).
3. CSRF: las Server Actions de Next.js validan `Origin` vs `Host`; `allowedOrigins` en `next.config.mjs`; sin endpoints GET que muten.
4. Entradas: Zod en toda acción (`safeParse` antes de cualquier lógica). Nunca confiar en unidades, cantidades de OC ni precios enviados por el cliente cuando existe un valor en BD.
5. Archivos: Vercel Blob **privado**, ruta aleatoria, tipo real por firma, descarga por `/api/archivos/[id]` con (sesión + HMAC ≤5 min ligado al usuario + permiso por objeto).
6. Datos bancarios: CLABE cifrada AES-256-GCM (`DATA_ENCRYPTION_KEY`); en pantalla solo últimos 4.
7. Secretos solo en variables de entorno; `.env*` fuera de git; errores inesperados se loguean y se devuelven genéricos.
8. Cabeceras de seguridad en `next.config.mjs`. Cron protegido con `CRON_SECRET`.
9. Separación de funciones: nadie aprueba su propia solicitud.

## Ejemplo (acción)
```ts
export const confirmOrder = defineAction({ permission: "proveedor:portal", schema: confirmOrderSchema },
  async ({ input, session }) => {
    const [po] = await tx.select()...for("update");
    if (!po || po.supplierId !== session.supplierId) throw new BusinessError("Orden no encontrada.");
```

## Criterios de aceptación
- [ ] Un usuario proveedor A que pide el id de una OC/factura/archivo de B recibe 404.
- [ ] Una acción llamada sin sesión o sin permiso devuelve error, aunque se invoque a mano.
- [ ] Ninguna URL de Blob es pública ni aparece en el HTML.
