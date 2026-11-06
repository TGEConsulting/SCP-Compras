# Compras La Quinta — gestión de compras y proveedores

Aplicación web (Next.js 14 App Router · TypeScript · Tailwind · Drizzle · Neon · Vercel Blob · Clerk · Resend) para **Productos Lácteos La Quinta**: solicitudes → aprobación → orden de compra → proveedor → recepción con calidad → factura → **conciliación de tres vías** → pago.

> Estado: **MVP funcional** (ver `docs/PLAN-ITERACIONES.md` para lo que sigue y `docs/ARQUITECTURA.md` para decisiones y preguntas abiertas).

## Estructura

```
skills/                    8 skills del proyecto (reglas de negocio, seguridad, UI, despliegue…)
drizzle/                   migraciones versionadas (0000 esquema, 0001 bitácora inmutable)
scripts/                   migrate.ts · seed.ts
src/
  db/                      schema.ts (26 tablas) · index.ts (Neon pool + withRetry)
  lib/
    domain/                reconciliation.ts (PURA, con tests) · cfdi.ts (lector de XML CFDI)
    auth.ts permissions.ts audit.ts notify.ts storage.ts crypto.ts settings.ts validators.ts
  server/
    action.ts              defineAction(): sesión + permiso + Zod + errores uniformes
    actions/               requests · orders · receipts · invoices · payments  (Server Actions)
    services/              invoice-service (indicador, evaluación, conciliación) · supplier-rules
    queries.ts             lecturas con alcance por rol aplicado en el WHERE
  components/              ui.tsx · formularios · paneles del portal de proveedores
  app/(app)/               dashboard · solicitudes · ordenes · recepcion · facturas · pagos · proveedor
  app/api/                 archivos/[id] (descarga firmada) · cron/recordatorios
```

## Requisitos
Node ≥ 20 · cuentas de Neon, Vercel, Clerk y Resend.

## Instalación local

```bash
npm install
cp .env.example .env.local        # completa las variables (ver abajo)
npm run db:migrate                # aplica ./drizzle en tu base de Neon (rama dev)
ADMIN_EMAIL=tu@correo.com SEED_DEMO_USERS=true npm run db:seed
npm run dev                       # http://localhost:3000
npm test                          # pruebas de la conciliación
npm run typecheck
```

Generar secretos:
```bash
openssl rand -hex 32      # FILE_URL_SIGNING_SECRET, CRON_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY
```

### Cómo se dan de alta los usuarios
1. El administrador pre-registra al usuario en `users` + `user_roles` (por ahora vía `seed`/SQL; pantalla de administración en la iteración 2). Para proveedores se liga `users.supplier_id`.
2. La persona inicia sesión con Clerk **con el mismo correo (verificado)**; en el primer ingreso se enlaza `auth_id`. Sin pre-registro → «Tu usuario aún no tiene acceso».
3. El jefe de cada área se asigna en `areas.head_user_id` (el seed demo lo hace para Producción).

## Variables de entorno
Ver `.env.example`. Obligatorias: `DATABASE_URL` (pooler), `DATABASE_URL_UNPOOLED`, claves de Clerk, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `MAIL_FROM`, `FILE_URL_SIGNING_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `APP_URL`.

**Antes de producción** configura en `system_settings`: `empresa.rfc` (RFC receptor esperado en facturas), tolerancias y días de escalamiento.

## Migraciones (Drizzle)
```bash
npm run db:generate -- --name=<descripcion>   # tras editar src/db/schema.ts
git add drizzle && git commit                 # SIEMPRE versionadas
npm run db:migrate                            # usa DATABASE_URL_UNPOOLED
```
Prueba cada migración primero en una **rama de Neon** (copia instantánea de producción).

## Despliegue en Vercel (resumen; detalle en `skills/despliegue-vercel-neon`)
1. **Neon**: crea proyecto; ramas `main` (prod), `staging`, `dev`. Copia cadena *pooled* y *direct* de cada una.
2. **Vercel** → *Add New Project* → importa el repo de GitHub.
3. **Environment Variables** por ambiente (Production / Preview / Development): las de `.env.example`. Preview → rama `staging` de Neon.
4. **Storage → Blob**: crea un store **privado** y enlázalo (genera `BLOB_READ_WRITE_TOKEN`).
5. **Clerk**: crea la instancia de producción, añade tu dominio; pega las claves.
6. **Resend**: verifica tu dominio (SPF/DKIM) y usa un `MAIL_FROM` de ese dominio.
7. Ejecuta `npm run db:migrate` contra staging, valida el *Preview* y luego contra producción.
8. El cron diario (`vercel.json`) envía recordatorios y escalamientos; requiere `CRON_SECRET`.
9. Dominio: *Settings → Domains*. Observabilidad: *Logs* y *Runtime errors* del proyecto.

## Conectores
- **GitHub**: ramas + PR para todo cambio (`feat/…`, `fix/…`); no hay cambios directos a `main` ni a producción.
- **Neon / Vercel / Blob**: usados como arriba. **Google Drive / Notion**: solo lectura de especificaciones, si se conectan; **Slack/Teams**: fase posterior. **Facturama/SW/Pacífico (validación CFDI ante SAT)**: opcional futuro — hoy solo se valida la estructura del XML.
- No hay integración con ERP, bancos ni contabilidad en el MVP.

## Seguridad en una mirada
Permisos verificados en servidor en cada página/acción · aislamiento por proveedor en cada consulta · Zod en toda entrada · archivos en Blob privado con enlaces firmados de 5 min · CLABE cifrada AES-256-GCM · bitácora inmutable · cabeceras de seguridad · CSRF por validación de `Origin` de Server Actions. Detalle en `skills/seguridad-y-roles`.

## Licencia / uso
Software interno de Productos Lácteos La Quinta S.A. de C.V.
