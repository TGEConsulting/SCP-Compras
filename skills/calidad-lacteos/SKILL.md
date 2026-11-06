---
name: calidad-lacteos
description: Controles de calidad en la recepción de productos lácteos e insumos (lote, caducidad, temperatura, empaque, inspección, rechazo con evidencia). Úsalo al tocar la recepción o la inspección.
---

# Calidad en recepción de lácteos

## Instrucciones
La inspección se captura **por partida** en la pantalla de recepción y se valida en servidor (`registerReceipt`). Los umbrales viven en el catálogo de productos (`requires_cold_chain`, `max_arrival_temp_c`, `requires_expiry_date`, `requires_tech_sheet`), no en el código.

## Controles por partida
Lote del proveedor · fecha de caducidad / consumo preferente · temperatura de llegada · condición del empaque (Íntegro / Daño leve / Daño grave) · integridad del producto · documentación del proveedor (remisión, fichas, certificados) · resultado: **Conforme / Condicionado / Rechazado** · motivo de rechazo · acción correctiva solicitada · evidencias fotográficas.

## Reglas
- Lote obligatorio en toda partida recibida. Caducidad obligatoria si el producto la requiere; **producto caducado no puede aceptarse**.
- Cadena fría: temperatura obligatoria; si excede el máximo del producto no puede marcarse «Conforme».
- Cantidad rechazada > 0 ⇒ motivo + acción correctiva + **≥ 1 foto** (obligatoria) y resultado ≠ Conforme.
- Resultado «Rechazado» ⇒ cantidad aceptada = 0.
- recibido = aceptado + rechazado (también `CHECK` en BD).
- Lo rechazado **no se paga** (la conciliación lo bloquea) y no consume la cantidad ordenada.
- Rechazo ⇒ notificación a Calidad, Compras y proveedor; auditoría `RECHAZAR_PRODUCTO`.
- Fotos: JPG/PNG/WebP, validadas por firma, en Blob privado, ligadas a `receipt_items`.
- Fichas técnicas / certificados requeridos: el proveedor los carga en su portal (`FICHA_TECNICA`, homologación). *Bloquear la recepción si falta la ficha vigente queda como decisión pendiente (ver docs).*

## Ejemplo
Cultivo láctico (máx. −18 °C) llega a −10 °C: el formulario impide «Conforme»; Calidad rechaza 5 kg con foto, motivo «ruptura de cadena fría» y acción «reposición en 48 h».

## Criterios de aceptación
- [ ] Imposible guardar un rechazo sin foto, motivo y acción correctiva.
- [ ] Imposible aceptar producto caducado o con temperatura fuera de rango como conforme.
- [ ] La evidencia fotográfica se abre solo con enlace firmado.
