// Shared formatting. Pure, so stats and tests can use it without pulling in any screen.
// Calendar days and months follow Paris time, because that is the seller's tax calendar.
const TIME_ZONE = "Europe/Paris";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const euros = (n: number | undefined) => (n === undefined ? "?" : eur.format(n));

// Money in cents: 4.79 - 0.1 is 4.6899999999999995 in floating point.
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const dateFr = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: TIME_ZONE });

export const dateLong = (t: number) =>
  new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });

const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" });

function yearMonth(t: number): { year: number; month: string } {
  const p = parts.formatToParts(new Date(t));
  return { year: Number(p.find((x) => x.type === "year")!.value), month: p.find((x) => x.type === "month")!.value };
}

export const yearOf = (t: number) => yearMonth(t).year;

// "2026-04": the month a timestamp falls in, in Paris time.
export const monthKey = (t: number) => {
  const { year, month } = yearMonth(t);
  return `${year}-${month}`;
};
