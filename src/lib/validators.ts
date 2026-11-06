import { z } from "zod";

/** Esquemas Zod compartidos entre formularios (validación en tiempo real) y Server Actions (validación autoritativa). */
const uuid = z.string().uuid("Identificador inválido");
const qty = z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Cantidad inválida (máx. 3 decimales)");
const price = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Importe inválido (máx. 4 decimales)");
const optText = (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const requestItemSchema = z.object({
  productId: uuid,
  description: optText(300),
  quantity: qty.refine((v) => Number(v) > 0, "Debe ser mayor que 0"),
  estimatedUnitPrice: price.optional().or(z.literal("").transform(() => undefined)),
});

export const saveRequestSchema = z.object({
  requestId: uuid.optional(),
  title: z.string().trim().min(5, "Describe la solicitud (mín. 5 caracteres)").max(150),
  justification: z.string().trim().min(10, "Explica el motivo (mín. 10 caracteres)").max(1000),
  costCenterId: uuid.optional().or(z.literal("").transform(() => undefined)),
  neededBy: isoDate.optional().or(z.literal("").transform(() => undefined)),
  items: z.array(requestItemSchema).min(1, "Agrega al menos un producto").max(60),
  submit: z.boolean().default(false),
});
export type SaveRequestInput = z.input<typeof saveRequestSchema>;

export const decideRequestSchema = z.object({
  requestId: uuid,
  decision: z.enum(["APROBAR", "RECHAZAR", "DEVOLVER"]),
  reason: z.string().trim().max(500).optional(),
}).refine((d) => d.decision === "APROBAR" || (d.reason && d.reason.length >= 5), { path: ["reason"], message: "Indica el motivo (mín. 5 caracteres)" });

export const createOrderSchema = z.object({
  requestId: uuid,
  supplierId: uuid,
  paymentTerms: optText(200),
  deliveryAddress: optText(300),
  notes: optText(500),
  lines: z.array(z.object({
    requestItemId: uuid,
    unitPrice: price.refine((v) => Number(v) > 0, "Debe ser mayor que 0"),
    taxRate: z.string().regex(/^0(\.\d{1,4})?$|^1$/, "Tasa inválida (ej. 0.16)").default("0.16"),
  })).min(1),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const confirmOrderSchema = z.object({
  orderId: uuid,
  promisedDate: isoDate,
  trackingNumber: optText(80),
});

export const receiptItemSchema = z.object({
  orderItemId: uuid,
  received: qty, accepted: qty, rejected: qty,
  supplierLot: optText(60),
  expiryDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  arrivalTempC: z.string().trim().regex(/^-?\d+(\.\d)?$/, "Temperatura inválida").optional().or(z.literal("").transform(() => undefined)),
  packagingCondition: z.enum(["INTEGRO", "DANADO_LEVE", "DANADO_GRAVE"]).optional(),
  inspectionResult: z.enum(["CONFORME", "CONDICIONADO", "RECHAZADO"]),
  rejectionReason: optText(300),
  correctiveAction: optText(300),
  observations: optText(300),
});
export const registerReceiptSchema = z.object({
  orderId: uuid,
  mode: z.enum(["PENDIENTE_FACTURA", "FINALIZAR"]),
  trackingNumber: optText(80),
  supplierDeliveryNote: optText(80),
  observations: optText(500),
  items: z.array(receiptItemSchema).min(1),
});
export type RegisterReceiptInput = z.input<typeof registerReceiptSchema>;

export const uploadInvoiceSchema = z.object({ orderId: uuid });
export const authorizeDifferenceSchema = z.object({ differenceId: uuid, reason: z.string().trim().min(10, "Explica el motivo (mín. 10 caracteres)").max(500) });
export const rejectInvoiceSchema = z.object({ invoiceId: uuid, reason: z.string().trim().min(10, "Explica el motivo (mín. 10 caracteres)").max(500) });
export const authorizePaymentSchema = z.object({ invoiceId: uuid });
export const registerPaymentSchema = z.object({
  paymentId: uuid, reference: z.string().trim().min(3, "Captura la referencia").max(80), paymentDate: isoDate,
});
export const uploadOrderDocSchema = z.object({ orderId: uuid, kind: z.enum(["REMISION", "ACUSE", "GUIA", "COTIZACION", "FICHA_TECNICA"]) });

// ── Administración (iteración 2)
const optId = z.string().uuid().optional().or(z.literal("").transform(() => undefined));
export const upsertUserSchema = z.object({
  userId: optId,
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  name: z.string().trim().min(3, "Captura el nombre").max(120),
  areaId: optId, supplierId: optId,
  roles: z.array(z.enum(["SOLICITANTE", "JEFE_AREA", "COMPRAS", "ALMACEN", "CALIDAD", "FINANZAS", "PROVEEDOR", "ADMIN"])).min(1, "Asigna al menos un rol"),
  active: z.boolean().default(true),
}).refine((d) => !d.roles.includes("PROVEEDOR") || !!d.supplierId, { path: ["supplierId"], message: "Un usuario proveedor debe ligarse a un proveedor" });
export const upsertSupplierSchema = z.object({
  supplierId: optId,
  code: z.string().trim().min(2).max(20),
  rfc: z.string().trim().toUpperCase().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "RFC inválido"),
  legalName: z.string().trim().min(3).max(200),
  email: z.string().trim().toLowerCase().email(),
  status: z.enum(["PENDIENTE", "AUTORIZADO", "SUSPENDIDO", "BAJA"]),
  documentsValidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});
export const upsertProductSchema = z.object({
  productId: optId,
  sku: z.string().trim().min(2).max(30),
  name: z.string().trim().min(3).max(150),
  uomId: z.string().uuid("Elige la unidad"),
  categoryId: optId,
  requiresColdChain: z.boolean().default(false),
  maxArrivalTempC: z.string().regex(/^-?\d+(\.\d)?$/).optional().or(z.literal("").transform(() => undefined)),
  requiresExpiryDate: z.boolean().default(true),
  active: z.boolean().default(true),
});
export const setSettingSchema = z.object({ key: z.string().min(3).max(60), valueJson: z.string().max(500) });
export const setAreaHeadSchema = z.object({ areaId: z.string().uuid(), headUserId: z.string().uuid() });
export const cancelOrderSchema = z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(10, "Explica el motivo (mín. 10 caracteres)").max(500) });
