const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Mexico_City" });
const dateTimeFmt = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

export const money = (v: string | number | null | undefined) => (v === null || v === undefined ? "—" : mxn.format(Number(v)));
export const date = (v: string | Date | null | undefined) => (v ? dateFmt.format(typeof v === "string" && v.length === 10 ? new Date(v + "T12:00:00") : new Date(v)) : "—");
export const dateTime = (v: string | Date | null | undefined) => (v ? dateTimeFmt.format(new Date(v)) : "—");
export const qtyFmt = (v: string | number) => Number(v).toLocaleString("es-MX", { maximumFractionDigits: 3 });

/** Días hábiles (lun–vie) entre dos fechas. No considera días festivos (pendiente: calendario configurable). */
export function businessDaysBetween(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
