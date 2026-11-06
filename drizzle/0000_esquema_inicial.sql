CREATE TYPE "public"."severidad_diferencia" AS ENUM('BLOQUEO', 'DIFERENCIA', 'AVISO');--> statement-breakpoint
CREATE TYPE "public"."resultado_inspeccion" AS ENUM('CONFORME', 'CONDICIONADO', 'RECHAZADO');--> statement-breakpoint
CREATE TYPE "public"."estatus_factura" AS ENUM('CARGADA', 'EN_VALIDACION', 'CON_DIFERENCIA', 'CONCILIADA', 'LISTA_PARA_PAGO', 'PAGADA', 'BLOQUEADA', 'RECHAZADA');--> statement-breakpoint
CREATE TYPE "public"."estatus_notificacion" AS ENUM('PENDIENTE', 'ENVIADA', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."estatus_orden" AS ENUM('OC_GENERADA', 'ENVIADA_PROVEEDOR', 'CONFIRMADA', 'EN_TRANSITO', 'RECIBIDA_PARCIAL', 'RECIBIDA_TOTAL', 'BLOQUEADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."condicion_empaque" AS ENUM('INTEGRO', 'DANADO_LEVE', 'DANADO_GRAVE');--> statement-breakpoint
CREATE TYPE "public"."estatus_pago" AS ENUM('AUTORIZADO', 'PAGADO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."estatus_recepcion" AS ENUM('PENDIENTE_FACTURA', 'COMPLETADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."estatus_solicitud" AS ENUM('BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'DEVUELTA', 'OC_GENERADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."estatus_proveedor" AS ENUM('PENDIENTE', 'AUTORIZADO', 'SUSPENDIDO', 'BAJA');--> statement-breakpoint
CREATE SEQUENCE "public"."seq_folio_orden" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."seq_folio_recepcion" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."seq_folio_solicitud" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"head_user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "areas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"supplier_id" uuid,
	"kind" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_name" text,
	"roles" text[],
	"table_name" text NOT NULL,
	"record_id" uuid,
	"action" text NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"comment" text,
	"origin" text DEFAULT 'web' NOT NULL,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "cost_centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invoice_differences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" "severidad_diferencia" NOT NULL,
	"order_item_id" uuid,
	"message" text NOT NULL,
	"expected" text,
	"actual" text,
	"requires_authorization" boolean DEFAULT false NOT NULL,
	"authorized_by" uuid,
	"authorized_at" timestamp with time zone,
	"authorization_reason" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"order_item_id" uuid,
	"product_key" text,
	"description" text NOT NULL,
	"uom_code" text,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"tax_amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "estatus_factura" DEFAULT 'CARGADA' NOT NULL,
	"uuid_cfdi" text NOT NULL,
	"series" text,
	"invoice_number" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"issuer_rfc" text NOT NULL,
	"issuer_name" text,
	"receiver_rfc" text NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"tax_total" numeric(18, 2) NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"pdf_attachment_id" uuid,
	"xml_attachment_id" uuid,
	"blocked_reason" text,
	"reconciled_at" timestamp with time zone,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"supplier_id" uuid,
	"to_email" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"link_path" text,
	"entity_type" text,
	"entity_id" uuid,
	"status" "estatus_notificacion" DEFAULT 'PENDIENTE' NOT NULL,
	"dedupe_key" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "estatus_pago" DEFAULT 'AUTORIZADO' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"authorized_by" uuid NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by" uuid,
	"paid_at" timestamp with time zone,
	"payment_date" date,
	"reference" text,
	"proof_attachment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "pay_amount_pos" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "plants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "product_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"uom_id" uuid NOT NULL,
	"requires_cold_chain" boolean DEFAULT false NOT NULL,
	"max_arrival_temp_c" numeric(5, 1),
	"requires_expiry_date" boolean DEFAULT true NOT NULL,
	"requires_tech_sheet" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"request_item_id" uuid,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"uom_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.1600' NOT NULL,
	"line_subtotal" numeric(18, 2) NOT NULL,
	CONSTRAINT "poi_qty_pos" CHECK ("purchase_order_items"."quantity" > 0),
	CONSTRAINT "poi_price_nonneg" CHECK ("purchase_order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" text DEFAULT 'OC-' || lpad(nextval('seq_folio_orden')::text, 6, '0') NOT NULL,
	"request_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "estatus_orden" DEFAULT 'OC_GENERADA' NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"tax_total" numeric(18, 2) NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"delivery_address" text,
	"payment_terms" text,
	"notes" text,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"promised_date" date,
	"tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "purchase_orders_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 3) NOT NULL,
	"uom_id" uuid NOT NULL,
	"estimated_unit_price" numeric(18, 4),
	CONSTRAINT "pri_qty_pos" CHECK ("purchase_request_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" text DEFAULT 'SC-' || lpad(nextval('seq_folio_solicitud')::text, 6, '0') NOT NULL,
	"requester_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"cost_center_id" uuid,
	"status" "estatus_solicitud" DEFAULT 'BORRADOR' NOT NULL,
	"title" text NOT NULL,
	"justification" text NOT NULL,
	"needed_by" date,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "purchase_requests_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity_ordered" numeric(18, 3) NOT NULL,
	"quantity_received" numeric(18, 3) NOT NULL,
	"quantity_accepted" numeric(18, 3) NOT NULL,
	"quantity_rejected" numeric(18, 3) NOT NULL,
	"supplier_lot" text,
	"expiry_date" date,
	"arrival_temp_c" numeric(5, 1),
	"packaging_condition" "condicion_empaque",
	"inspection_result" "resultado_inspeccion" DEFAULT 'CONFORME' NOT NULL,
	"rejection_reason" text,
	"corrective_action" text,
	"observations" text,
	CONSTRAINT "ri_balance" CHECK ("receipt_items"."quantity_received" = "receipt_items"."quantity_accepted" + "receipt_items"."quantity_rejected"),
	CONSTRAINT "ri_nonneg" CHECK ("receipt_items"."quantity_received" >= 0 AND "receipt_items"."quantity_accepted" >= 0 AND "receipt_items"."quantity_rejected" >= 0),
	CONSTRAINT "ri_reject_reason" CHECK ("receipt_items"."quantity_rejected" = 0 OR ("receipt_items"."rejection_reason" IS NOT NULL AND length(trim("receipt_items"."rejection_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" text DEFAULT 'RC-' || lpad(nextval('seq_folio_recepcion')::text, 6, '0') NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "estatus_recepcion" NOT NULL,
	"tracking_number" text,
	"supplier_delivery_note" text,
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_status_at_receipt" text NOT NULL,
	"observations" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "receipts_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "supplier_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"holder_name" text NOT NULL,
	"clabe_encrypted" text NOT NULL,
	"clabe_last4" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text
);
--> statement-breakpoint
CREATE TABLE "supplier_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"attachment_id" uuid,
	"valid_until" date,
	"status" text DEFAULT 'PENDIENTE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"rfc" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"email" text NOT NULL,
	"phone" text,
	"status" "estatus_proveedor" DEFAULT 'PENDIENTE' NOT NULL,
	"documents_valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code"),
	CONSTRAINT "suppliers_rfc_unique" UNIQUE("rfc")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "units_of_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sat_key" text,
	CONSTRAINT "units_of_measure_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"supplier_id" uuid,
	"plant_id" uuid,
	"area_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"change_reason" text,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_differences" ADD CONSTRAINT "invoice_differences_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_differences" ADD CONSTRAINT "invoice_differences_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_differences" ADD CONSTRAINT "invoice_differences_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_attachment_id_attachments_id_fk" FOREIGN KEY ("pdf_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_xml_attachment_id_attachments_id_fk" FOREIGN KEY ("xml_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_authorized_by_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_attachment_id_attachments_id_fk" FOREIGN KEY ("proof_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_uom_id_units_of_measure_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."units_of_measure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_request_item_id_purchase_request_items_id_fk" FOREIGN KEY ("request_item_id") REFERENCES "public"."purchase_request_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_uom_id_units_of_measure_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."units_of_measure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_uom_id_units_of_measure_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."units_of_measure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bank_accounts" ADD CONSTRAINT "supplier_bank_accounts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_documents" ADD CONSTRAINT "supplier_documents_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "audit_record_idx" ON "audit_logs" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "idf_invoice_idx" ON "invoice_differences" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ii_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_uuid_uq" ON "invoices" USING btree ("uuid_cfdi");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_supplier_number_uq" ON "invoices" USING btree ("supplier_id",coalesce("series", ''),"invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_supplier_order_active_uq" ON "invoices" USING btree ("supplier_id","order_id") WHERE "invoices"."status" <> 'RECHAZADA';--> statement-breakpoint
CREATE INDEX "inv_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inv_order_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "notif_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_invoice_active_uq" ON "payments" USING btree ("invoice_id") WHERE "payments"."status" <> 'CANCELADO';--> statement-breakpoint
CREATE INDEX "poi_order_idx" ON "purchase_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "po_request_idx" ON "purchase_orders" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "pri_request_idx" ON "purchase_request_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "pr_status_idx" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pr_requester_idx" ON "purchase_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "pr_area_idx" ON "purchase_requests" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "ri_receipt_idx" ON "receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "ri_orderitem_idx" ON "receipt_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "rc_order_idx" ON "receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "rc_status_idx" ON "receipts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suppliers_status_idx" ON "suppliers" USING btree ("status");