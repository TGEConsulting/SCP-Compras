/**
 * Esquema Drizzle — Gestión de compras La Quinta.
 * Convenciones:
 *  - PK uuid; folios legibles generados por secuencia en BD (sin condiciones de carrera).
 *  - Dinero: numeric(18,4) precios / numeric(18,2) totales. Cantidades: numeric(18,3). Drizzle los devuelve como string
 *    (nunca usar float; los cálculos se hacen con decimal.js en src/lib/domain).
 *  - Columnas de trazabilidad en todas las tablas operativas (`trace`).
 *  - Invariantes críticos viven en la BD (CHECK / UNIQUE), no solo en la aplicación.
 */
import { sql } from "drizzle-orm";
import {
  boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgSequence, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// ───────────────────────── Enums ─────────────────────────
export const ROLE_CODES = ["SOLICITANTE", "JEFE_AREA", "COMPRAS", "ALMACEN", "CALIDAD", "FINANZAS", "PROVEEDOR", "ADMIN"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const requestStatus = pgEnum("estatus_solicitud", ["BORRADOR", "ENVIADA", "EN_REVISION", "APROBADA", "RECHAZADA", "DEVUELTA", "OC_GENERADA", "CANCELADA"]);
export const orderStatus = pgEnum("estatus_orden", ["OC_GENERADA", "ENVIADA_PROVEEDOR", "CONFIRMADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA_TOTAL", "BLOQUEADA", "CANCELADA"]);
export const receiptStatus = pgEnum("estatus_recepcion", ["PENDIENTE_FACTURA", "COMPLETADA", "CANCELADA"]);
export const invoiceStatus = pgEnum("estatus_factura", ["CARGADA", "EN_VALIDACION", "CON_DIFERENCIA", "CONCILIADA", "LISTA_PARA_PAGO", "PAGADA", "BLOQUEADA", "RECHAZADA"]);
export const paymentStatus = pgEnum("estatus_pago", ["AUTORIZADO", "PAGADO", "CANCELADO"]);
export const supplierStatus = pgEnum("estatus_proveedor", ["PENDIENTE", "AUTORIZADO", "SUSPENDIDO", "BAJA"]);
export const inspectionResult = pgEnum("resultado_inspeccion", ["CONFORME", "CONDICIONADO", "RECHAZADO"]);
export const packagingCondition = pgEnum("condicion_empaque", ["INTEGRO", "DANADO_LEVE", "DANADO_GRAVE"]);
export const diffSeverity = pgEnum("severidad_diferencia", ["BLOQUEO", "DIFERENCIA", "AVISO"]);
export const notificationStatus = pgEnum("estatus_notificacion", ["PENDIENTE", "ENVIADA", "ERROR"]);

// Secuencias para folios (atómicas, sin huecos por concurrencia de lectura+escritura)
export const seqSolicitud = pgSequence("seq_folio_solicitud", { startWith: 1 });
export const seqOrden = pgSequence("seq_folio_orden", { startWith: 1 });
export const seqRecepcion = pgSequence("seq_folio_recepcion", { startWith: 1 });
const folio = (name: string, prefix: string, seq: string) =>
  text(name).notNull().unique().default(sql.raw(`'${prefix}-' || lpad(nextval('${seq}')::text, 6, '0')`));

const ts = (name: string) => timestamp(name, { withTimezone: true });
/** Trazabilidad común. created_by/updated_by sin FK a propósito (evita ciclos y bloqueos al archivar usuarios). */
const trace = {
  createdAt: ts("created_at").notNull().defaultNow(),
  createdBy: uuid("created_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  changeReason: text("change_reason"),
};

// ───────────────────────── Organización y usuarios ─────────────────────────
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

export const plants = pgTable("plants", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  ...trace,
});

export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantId: uuid("plant_id").notNull().references(() => plants.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  headUserId: uuid("head_user_id"), // jefe de área (FK lógica a users para evitar ciclo)
  active: boolean("active").notNull().default(true),
  ...trace,
});

export const costCenters = pgTable("cost_centers", {
  id: uuid("id").primaryKey().defaultRandom(),
  areaId: uuid("area_id").references(() => areas.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  ...trace,
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  rfc: text("rfc").notNull().unique(),
  legalName: text("legal_name").notNull(),
  tradeName: text("trade_name"),
  email: text("email").notNull(),
  phone: text("phone"),
  status: supplierStatus("status").notNull().default("PENDIENTE"),
  /** Vigencia mínima de la documentación de homologación; si vence, no se pueden generar OC. */
  documentsValidUntil: date("documents_valid_until"),
  ...trace,
}, (t) => [index("suppliers_status_idx").on(t.status)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Id de Clerk; se enlaza en el primer inicio de sesión por correo pre-registrado por el administrador. */
  authId: text("auth_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Si es usuario de proveedor, su proveedor (aislamiento de datos). */
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  plantId: uuid("plant_id").references(() => plants.id),
  areaId: uuid("area_id").references(() => areas.id),
  active: boolean("active").notNull().default(true),
  ...trace,
});

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  grantedAt: ts("granted_at").notNull().defaultNow(),
  grantedBy: uuid("granted_by"),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

// ───────────────────────── Catálogos ─────────────────────────
export const unitsOfMeasure = pgTable("units_of_measure", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // ej. KG, L, PZA
  name: text("name").notNull(),
  satKey: text("sat_key"), // ClaveUnidad SAT (H87, KGM, LTR…)
});

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  categoryId: uuid("category_id").references(() => productCategories.id),
  uomId: uuid("uom_id").notNull().references(() => unitsOfMeasure.id),
  /** Controles de calidad en recepción */
  requiresColdChain: boolean("requires_cold_chain").notNull().default(false),
  maxArrivalTempC: numeric("max_arrival_temp_c", { precision: 5, scale: 1 }),
  requiresExpiryDate: boolean("requires_expiry_date").notNull().default(true),
  requiresTechSheet: boolean("requires_tech_sheet").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...trace,
});

// ───────────────────────── Archivos ─────────────────────────
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Entidad dueña (para autorizar la descarga): tabla + id. */
  ownerType: text("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id), // para aislar por proveedor
  kind: text("kind").notNull(), // FACTURA_PDF, FACTURA_XML, COTIZACION, FICHA_TECNICA, REMISION, ACUSE, GUIA, EVIDENCIA_FOTO, COMPROBANTE_PAGO, HOMOLOGACION
  blobPathname: text("blob_pathname").notNull(), // clave en Vercel Blob (almacén privado)
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: ts("uploaded_at").notNull().defaultNow(),
}, (t) => [index("attachments_owner_idx").on(t.ownerType, t.ownerId)]);

export const supplierDocuments = pgTable("supplier_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  docType: text("doc_type").notNull(), // CSF, OPINION_32D, CERT_INOCUIDAD, CONTRATO…
  attachmentId: uuid("attachment_id").references(() => attachments.id),
  validUntil: date("valid_until"),
  status: text("status").notNull().default("PENDIENTE"), // PENDIENTE | VIGENTE | VENCIDO | RECHAZADO
  ...trace,
});

export const supplierBankAccounts = pgTable("supplier_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  bankName: text("bank_name").notNull(),
  holderName: text("holder_name").notNull(),
  /** CLABE cifrada con AES-256-GCM (src/lib/crypto.ts). Nunca en texto plano. */
  clabeEncrypted: text("clabe_encrypted").notNull(),
  clabeLast4: text("clabe_last4").notNull(),
  active: boolean("active").notNull().default(true),
  ...trace,
});

// ───────────────────────── Solicitudes ─────────────────────────
export const purchaseRequests = pgTable("purchase_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  folio: folio("folio", "SC", "seq_folio_solicitud"),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  areaId: uuid("area_id").notNull().references(() => areas.id),
  plantId: uuid("plant_id").notNull().references(() => plants.id),
  costCenterId: uuid("cost_center_id").references(() => costCenters.id),
  status: requestStatus("status").notNull().default("BORRADOR"),
  title: text("title").notNull(),
  justification: text("justification").notNull(),
  neededBy: date("needed_by"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: ts("decided_at"),
  decisionReason: text("decision_reason"),
  ...trace,
}, (t) => [index("pr_status_idx").on(t.status), index("pr_requester_idx").on(t.requesterId), index("pr_area_idx").on(t.areaId)]);

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => purchaseRequests.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  description: text("description"),
  quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
  uomId: uuid("uom_id").notNull().references(() => unitsOfMeasure.id),
  estimatedUnitPrice: numeric("estimated_unit_price", { precision: 18, scale: 4 }),
}, (t) => [check("pri_qty_pos", sql`${t.quantity} > 0`), index("pri_request_idx").on(t.requestId)]);

// ───────────────────────── Órdenes de compra ─────────────────────────
export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  folio: folio("folio", "OC", "seq_folio_orden"),
  requestId: uuid("request_id").notNull().references(() => purchaseRequests.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  status: orderStatus("status").notNull().default("OC_GENERADA"),
  currency: text("currency").notNull().default("MXN"),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull(),
  taxTotal: numeric("tax_total", { precision: 18, scale: 2 }).notNull(),
  total: numeric("total", { precision: 18, scale: 2 }).notNull(),
  deliveryAddress: text("delivery_address"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  sentAt: ts("sent_at"),
  confirmedAt: ts("confirmed_at"),
  promisedDate: date("promised_date"),
  trackingNumber: text("tracking_number"), // guía
  ...trace,
}, (t) => [index("po_supplier_idx").on(t.supplierId), index("po_status_idx").on(t.status), index("po_request_idx").on(t.requestId)]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  requestItemId: uuid("request_item_id").references(() => purchaseRequestItems.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  description: text("description").notNull(),
  uomId: uuid("uom_id").notNull().references(() => unitsOfMeasure.id),
  quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull().default("0.1600"), // IVA 16 % = 0.1600
  lineSubtotal: numeric("line_subtotal", { precision: 18, scale: 2 }).notNull(),
}, (t) => [check("poi_qty_pos", sql`${t.quantity} > 0`), check("poi_price_nonneg", sql`${t.unitPrice} >= 0`), index("poi_order_idx").on(t.orderId)]);

// ───────────────────────── Recepciones ─────────────────────────
export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  folio: folio("folio", "RC", "seq_folio_recepcion"),
  orderId: uuid("order_id").notNull().references(() => purchaseOrders.id),
  status: receiptStatus("status").notNull(),
  trackingNumber: text("tracking_number"),
  supplierDeliveryNote: text("supplier_delivery_note"), // remisión
  receivedBy: uuid("received_by").notNull().references(() => users.id),
  receivedAt: ts("received_at").notNull().defaultNow(),
  /** Estatus de la factura en el momento de registrar (NO_CARGADA | CARGADA | …) — evidencia de lo que vio el usuario. */
  invoiceStatusAtReceipt: text("invoice_status_at_receipt").notNull(),
  observations: text("observations"),
  ...trace,
}, (t) => [index("rc_order_idx").on(t.orderId), index("rc_status_idx").on(t.status)]);

export const receiptItems = pgTable("receipt_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id").notNull().references(() => purchaseOrderItems.id),
  quantityOrdered: numeric("quantity_ordered", { precision: 18, scale: 3 }).notNull(),
  quantityReceived: numeric("quantity_received", { precision: 18, scale: 3 }).notNull(),
  quantityAccepted: numeric("quantity_accepted", { precision: 18, scale: 3 }).notNull(),
  quantityRejected: numeric("quantity_rejected", { precision: 18, scale: 3 }).notNull(),
  supplierLot: text("supplier_lot"),
  expiryDate: date("expiry_date"),
  arrivalTempC: numeric("arrival_temp_c", { precision: 5, scale: 1 }),
  packagingCondition: packagingCondition("packaging_condition"),
  inspectionResult: inspectionResult("inspection_result").notNull().default("CONFORME"),
  rejectionReason: text("rejection_reason"),
  correctiveAction: text("corrective_action"),
  observations: text("observations"),
}, (t) => [
  // Invariante de calidad: recibido = aceptado + rechazado, sin negativos
  check("ri_balance", sql`${t.quantityReceived} = ${t.quantityAccepted} + ${t.quantityRejected}`),
  check("ri_nonneg", sql`${t.quantityReceived} >= 0 AND ${t.quantityAccepted} >= 0 AND ${t.quantityRejected} >= 0`),
  // Un rechazo exige motivo
  check("ri_reject_reason", sql`${t.quantityRejected} = 0 OR (${t.rejectionReason} IS NOT NULL AND length(trim(${t.rejectionReason})) > 0)`),
  index("ri_receipt_idx").on(t.receiptId), index("ri_orderitem_idx").on(t.orderItemId),
]);

// ───────────────────────── Facturas ─────────────────────────
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => purchaseOrders.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  status: invoiceStatus("status").notNull().default("CARGADA"),
  uuidCfdi: text("uuid_cfdi").notNull(),
  series: text("series"),
  invoiceNumber: text("invoice_number").notNull(),
  issuedAt: ts("issued_at").notNull(),
  issuerRfc: text("issuer_rfc").notNull(),
  issuerName: text("issuer_name"),
  receiverRfc: text("receiver_rfc").notNull(),
  currency: text("currency").notNull().default("MXN"),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull(),
  taxTotal: numeric("tax_total", { precision: 18, scale: 2 }).notNull(),
  total: numeric("total", { precision: 18, scale: 2 }).notNull(),
  pdfAttachmentId: uuid("pdf_attachment_id").references(() => attachments.id),
  xmlAttachmentId: uuid("xml_attachment_id").references(() => attachments.id),
  blockedReason: text("blocked_reason"),
  reconciledAt: ts("reconciled_at"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  ...trace,
}, (t) => [
  uniqueIndex("inv_uuid_uq").on(t.uuidCfdi), // el UUID fiscal nunca se repite
  // coalesce: en Postgres NULL <> NULL, sin esto dos facturas sin serie con el mismo folio no chocarían.
  uniqueIndex("inv_supplier_number_uq").on(t.supplierId, sql`coalesce(${t.series}, '')`, t.invoiceNumber),
  // Una factura vigente por (proveedor, orden). Las rechazadas liberan el cupo.
  uniqueIndex("inv_supplier_order_active_uq").on(t.supplierId, t.orderId).where(sql`${t.status} <> 'RECHAZADA'`),
  index("inv_status_idx").on(t.status), index("inv_order_idx").on(t.orderId),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  /** Línea de OC con la que se emparejó el concepto; NULL = concepto no ordenado. */
  orderItemId: uuid("order_item_id").references(() => purchaseOrderItems.id),
  productKey: text("product_key"), // NoIdentificacion del CFDI
  description: text("description").notNull(),
  uomCode: text("uom_code"),
  quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull(),
  taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).notNull(),
}, (t) => [index("ii_invoice_idx").on(t.invoiceId)]);

/** Diferencias detectadas por la conciliación y su resolución (autorizaciones con motivo). */
export const invoiceDifferences = pgTable("invoice_differences", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  severity: diffSeverity("severity").notNull(),
  orderItemId: uuid("order_item_id").references(() => purchaseOrderItems.id),
  message: text("message").notNull(),
  expected: text("expected"),
  actual: text("actual"),
  requiresAuthorization: boolean("requires_authorization").notNull().default(false),
  authorizedBy: uuid("authorized_by").references(() => users.id),
  authorizedAt: ts("authorized_at"),
  authorizationReason: text("authorization_reason"),
  detectedAt: ts("detected_at").notNull().defaultNow(),
}, (t) => [index("idf_invoice_idx").on(t.invoiceId)]);

// ───────────────────────── Pagos ─────────────────────────
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  status: paymentStatus("status").notNull().default("AUTORIZADO"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  authorizedBy: uuid("authorized_by").notNull().references(() => users.id),
  authorizedAt: ts("authorized_at").notNull().defaultNow(),
  paidBy: uuid("paid_by").references(() => users.id),
  paidAt: ts("paid_at"),
  paymentDate: date("payment_date"),
  reference: text("reference"), // referencia bancaria / folio SPEI
  proofAttachmentId: uuid("proof_attachment_id").references(() => attachments.id),
  ...trace,
}, (t) => [
  uniqueIndex("pay_invoice_active_uq").on(t.invoiceId).where(sql`${t.status} <> 'CANCELADO'`), // 1 pago vigente por factura
  check("pay_amount_pos", sql`${t.amount} > 0`),
]);

// ───────────────────────── Auditoría, notificaciones, configuración ─────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: ts("at").notNull().defaultNow(),
  userId: uuid("user_id"),
  userName: text("user_name"),
  roles: text("roles").array(),
  tableName: text("table_name").notNull(),
  recordId: uuid("record_id"),
  action: text("action").notNull(),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  comment: text("comment"),
  origin: text("origin").notNull().default("web"), // web | cron | seed | sistema
  ip: text("ip"),
}, (t) => [index("audit_record_idx").on(t.tableName, t.recordId), index("audit_at_idx").on(t.at)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  supplierId: uuid("supplier_id").references(() => suppliers.id), // visible en el portal del proveedor
  toEmail: text("to_email").notNull(),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  linkPath: text("link_path"),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  status: notificationStatus("status").notNull().default("PENDIENTE"),
  /** Evita duplicados de recordatorios (p. ej. "recordatorio24:<orderId>"). */
  dedupeKey: text("dedupe_key").unique(),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  sentAt: ts("sent_at"),
  readAt: ts("read_at"),
}, (t) => [index("notif_status_idx").on(t.status)]);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});
