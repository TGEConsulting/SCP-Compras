---
name: estilo-ui-lq
description: Guía de interfaz en español, responsive y accesible para el sistema de compras (estatus, tablas, formularios, formato MXN y fechas). Úsalo al crear o cambiar pantallas y componentes.
---

# Estilo de UI La Quinta

## Instrucciones
- Todo texto de interfaz, botones, mensajes y estatus en **español**. Usuarios con poca experiencia técnica: frases cortas, un siguiente paso claro.
- Componentes reutilizables en `src/components/ui.tsx` (`StatusBadge, Card, Alert, Table, FilterBar, Pagination, History, btn, input`). No dupliques estilos.
- Estatus siempre con **color + texto** (`src/lib/status.ts`), nunca solo color.

## Reglas
- Mobile-first: objetivos táctiles ≥ 44 px (`min-h-[44px]`), tablas con scroll horizontal, formularios en 1 columna en móvil.
- Formato: `money()` (MXN, `es-MX`), `date()/dateTime()` (zona `America/Mexico_City`), `qtyFmt()`.
- Formularios: validación en vivo con el **mismo esquema Zod** del servidor; errores junto al campo y resumen arriba (`aria-live`); etiquetas `<label for>` reales.
- Listas: búsqueda, filtro por estatus, paginación (20) y ordenamiento por fecha descendente.
- Detalle: secciones en `Card`; historial visible (`History`) en solicitud, orden, factura.
- Evitar saturación: una tarea principal por pantalla; confirmaciones en diálogo; motivos obligatorios en rechazos.
- Acciones destructivas o irreversibles: botón `danger` + diálogo con motivo.

## Paleta
`brand` azul lácteo (`#1f6fa8`), verde = correcto/conciliado, ámbar = atención/pendiente, rojo = bloqueo/rechazo, gris = neutro.

## Ejemplo
```tsx
<StatusBadge def={INVOICE_STATUS[inv.status]} />   // «Factura con diferencia» en ámbar
<ActionButton action={rejectInvoice} payload={{ invoiceId }} variant="danger" reasonLabel="Motivo del rechazo" minReason={10}>Rechazar factura</ActionButton>
```

## Criterios de aceptación
- [ ] Usable a 360 px de ancho sin scroll horizontal de página.
- [ ] Contraste AA y foco visible; navegable con teclado.
- [ ] Ningún texto visible al usuario en inglés.
