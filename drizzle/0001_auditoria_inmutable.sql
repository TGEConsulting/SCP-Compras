-- La bitácora de auditoría es de solo-inserción: ni UPDATE ni DELETE (ni siquiera desde la app).
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es inmutable (% no permitido)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
--> statement-breakpoint
-- Una recepción finalizada con rechazo debe conservar sus cantidades: impedir borrar partidas de recepción.
CREATE OR REPLACE FUNCTION receipt_items_no_delete() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'No se pueden eliminar partidas de recepción; cancele la recepción';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER receipt_items_protect
  BEFORE DELETE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION receipt_items_no_delete();
