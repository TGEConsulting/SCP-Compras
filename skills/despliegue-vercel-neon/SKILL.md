---
name: despliegue-vercel-neon
description: Despliegue en Vercel con Neon (pooling, ramas por ambiente, migraciones), Vercel Blob privado, variables de entorno y validación antes de producción. Úsalo al configurar ambientes o desplegar.
---

# Despliegue Vercel + Neon

## Instrucciones
1. **Neon**: proyecto con rama `main` (producción) y ramas `staging` y `dev`. Copia **dos** cadenas por rama: *pooled* (`-pooler`) → `DATABASE_URL`; *direct* → `DATABASE_URL_UNPOOLED`.
2. **Vercel**: importa el repo de GitHub. Framework Next.js. Variables por ambiente (Production / Preview / Development) según `.env.example`; Preview apunta a la rama de Neon de pruebas (idealmente una rama efímera por PR).
3. **Blob**: Storage → Blob → crear store **privado**; `BLOB_READ_WRITE_TOKEN` por ambiente.
4. **Clerk**: instancia Development para Preview/Dev y Production aparte; dominios autorizados.
5. **Resend**: dominio verificado (SPF/DKIM) para `MAIL_FROM`.
6. **Cron**: `vercel.json` ejecuta `/api/cron/recordatorios` en días hábiles; define `CRON_SECRET`.

## Migraciones
```bash
DATABASE_URL_UNPOOLED=<rama staging> npm run db:migrate   # primero staging
# validar → luego producción (con confirmación explícita)
DATABASE_URL_UNPOOLED=<rama main> npm run db:migrate
```
Flujo seguro: PR → rama Neon efímera (`create_branch` desde `main`) → migrar → pruebas → merge → migrar `main`. **Las migraciones no corren en el build** (evita despliegues parciales); se ejecutan como paso explícito.

## Conexión
- Driver `@neondatabase/serverless` (WebSocket) para transacciones; `max` por instancia = `DB_POOL_MAX` (5).
- `withRetry()` reintenta solo errores transitorios (`ECONNRESET`, `57P01`, `40001`, `40P01`) con backoff + jitter. No reintentar operaciones con efectos externos fuera de la transacción.

## Validar antes de producción
`npm run typecheck && npm test && npm run build` · desplegar Preview · prueba de humo (login por rol, crear solicitud, recepción sin factura, carga de factura) · revisar logs en Vercel · promover.

## Reglas
- Nunca cambios directos en producción sin confirmación; usar PR.
- Rollback de app: «Instant Rollback» de Vercel. Rollback de datos: restauración a punto en el tiempo de Neon (ventana de retención del plan).
- Secretos nunca en el repo ni en logs.

## Criterios de aceptación
- [ ] Preview y Production usan ramas de Neon distintas.
- [ ] `db:migrate` aplicado en staging antes que en producción.
- [ ] El store de Blob es privado y no existen URLs públicas de archivos.
