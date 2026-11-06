"use client";
export function PrintButton() {
  return <button className="rounded-md border border-gray-300 px-4 py-2 text-sm print:hidden" onClick={() => window.print()}>Imprimir / Guardar PDF</button>;
}
