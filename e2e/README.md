# Recorrido E2E (solo Preview/staging)

Recorre el flujo completo con usuarios reales de Clerk: solicitud → aprobación → OC → confirmación → recepción **sin factura**
(mensaje obligatorio, PENDIENTE_FACTURA) → factura → conciliación → pago; y el caso de **bloqueo** (facturar cantidad rechazada).

```bash
# 1) Usuarios de prueba (Clerk de desarrollo + staging). Nunca producción: el script se niega.
export E2E_PASSWORD='una-clave-larga-12+'
npx tsx scripts/e2e-usuarios.ts up      # requiere CLERK_SECRET_KEY (sk_test_) y DATABASE_URL_UNPOOLED de staging

# 2) Recorrido (Python + Playwright)
export E2E_BASE_URL='https://<alias-del-preview>.vercel.app'
export E2E_SHARE_URL='https://...?_vercel_share=...'   # solo si el Preview está protegido
python3 e2e/flow.py 1 2 3 4 5 6 7 N 8 9                   # pasos: 1 solicitud · 2 aprobar · 3 OC · 4 proveedor · 5 recepción · 6 factura · 7 pago · N caso bloqueo · 8 seguimiento · 9 descarga segura

# 3) Limpieza
npx tsx scripts/e2e-usuarios.ts down
```
Los datos de negocio creados quedan en staging (la bitácora es inmutable). Las capturas se guardan en `e2e/out/` (ignorado por git).
