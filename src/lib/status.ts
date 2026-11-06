/** Etiquetas y colores de estatus. Un solo lugar para que el significado visual sea consistente en toda la app. */
type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple";
type Def = { label: string; tone: Tone };

export const REQUEST_STATUS: Record<string, Def> = {
  BORRADOR: { label: "Borrador", tone: "gray" }, ENVIADA: { label: "Enviada", tone: "blue" }, EN_REVISION: { label: "En revisión", tone: "blue" },
  APROBADA: { label: "Aprobada", tone: "green" }, RECHAZADA: { label: "Rechazada", tone: "red" }, DEVUELTA: { label: "Devuelta", tone: "amber" },
  OC_GENERADA: { label: "Orden de compra generada", tone: "purple" }, CANCELADA: { label: "Cancelada", tone: "gray" },
};
export const ORDER_STATUS: Record<string, Def> = {
  OC_GENERADA: { label: "Orden de compra generada", tone: "gray" }, ENVIADA_PROVEEDOR: { label: "Orden enviada al proveedor", tone: "blue" },
  CONFIRMADA: { label: "Confirmada por proveedor", tone: "green" }, EN_TRANSITO: { label: "En tránsito", tone: "purple" },
  RECIBIDA_PARCIAL: { label: "Recibida parcialmente", tone: "amber" }, RECIBIDA_TOTAL: { label: "Recibida totalmente", tone: "green" },
  BLOQUEADA: { label: "Bloqueada", tone: "red" }, CANCELADA: { label: "Cancelada", tone: "gray" },
};
export const RECEIPT_STATUS: Record<string, Def> = {
  PENDIENTE_FACTURA: { label: "PENDIENTE_FACTURA", tone: "amber" }, COMPLETADA: { label: "Completada", tone: "green" }, CANCELADA: { label: "Cancelada", tone: "gray" },
};
export const INVOICE_STATUS: Record<string, Def> = {
  CARGADA: { label: "Factura cargada", tone: "blue" }, EN_VALIDACION: { label: "Factura en validación", tone: "blue" },
  CON_DIFERENCIA: { label: "Factura con diferencia", tone: "amber" }, CONCILIADA: { label: "Conciliada", tone: "green" },
  LISTA_PARA_PAGO: { label: "Lista para pago", tone: "green" }, PAGADA: { label: "Pagada", tone: "green" },
  BLOQUEADA: { label: "Bloqueada", tone: "red" }, RECHAZADA: { label: "Rechazada", tone: "gray" },
};
/** Indicador de la pantalla de recepción (incluye «No cargada»). */
export const INDICATOR: Record<string, Def> = {
  NO_CARGADA: { label: "No cargada", tone: "gray" }, CARGADA: { label: "Cargada", tone: "blue" }, EN_VALIDACION: { label: "En validación", tone: "blue" },
  CON_DIFERENCIA: { label: "Con diferencia", tone: "amber" }, CONCILIADA: { label: "Conciliada", tone: "green" }, BLOQUEADA: { label: "Bloqueada", tone: "red" },
};
export const PAYMENT_STATUS: Record<string, Def> = {
  AUTORIZADO: { label: "Pago autorizado", tone: "blue" }, PAGADO: { label: "Pagado", tone: "green" }, CANCELADO: { label: "Cancelado", tone: "gray" },
};
export const INSPECTION: Record<string, Def> = { CONFORME: { label: "Conforme", tone: "green" }, CONDICIONADO: { label: "Condicionado", tone: "amber" }, RECHAZADO: { label: "Rechazado", tone: "red" } };
export const PACKAGING: Record<string, string> = { INTEGRO: "Íntegro", DANADO_LEVE: "Daño leve", DANADO_GRAVE: "Daño grave" };
