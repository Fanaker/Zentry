export const formatPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 2 }).format(n || 0);

export const formatUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);

export const formatNumber = (n: number, decimals = 2) =>
  new Intl.NumberFormat("es-PE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n || 0);

const MONTHS_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
export const monthName = (m: number) => MONTHS_ES[m - 1] ?? "";
export const monthsList = MONTHS_ES;

export const formatDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
};
