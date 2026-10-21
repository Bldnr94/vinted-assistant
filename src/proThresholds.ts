// French thresholds shown on the Pro tab. Every figure carries its official source and the date it was
// checked; when a figure changes (these are revised every few years), edit it here and bump asOf.
// Information only: the app is not tax advice, and the official page always wins.
//
// Checked on 2026-10-21 against the pages named in each note.
//
// Not covered, because no official page was found for it: the formal line between occasional resale of
// personal belongings and a professional activity (habitualité / intention de profit), and how a lot
// bought in one go should be entered in the purchases register.
import type { ThresholdSpec } from "./pro";

export const PRO_THRESHOLDS: { asOf: string; specs: ThresholdSpec[]; sources: { label: string; url: string }[] } = {
  asOf: "2026-10-21",
  specs: [
    {
      key: "micro-goods",
      label: "Micro-entrepreneur ceiling (sales of goods)",
      unit: "eur",
      limit: 203_100, // 2026-2028; it was 188 700 for 2023-2025
      note: "Per year, excluding VAT. The regime ends only after the ceiling is exceeded two years in a row.",
      sourceUrl: "https://www.impots.gouv.fr/professionnel/questions/pour-rester-micro-entrepreneur-quel-montant-de-chiffre-daffaires-ou-de",
    },
    {
      key: "vat-base",
      label: "VAT franchise, base threshold (sales of goods)",
      unit: "eur",
      limit: 85_000, // unchanged for 2026; the 25 000 single threshold of the 2025 finance law was repealed
      note: "Measured on the previous year's turnover.",
      sourceUrl: "https://entreprendre.service-public.gouv.fr/vosdroits/F21746",
    },
    {
      key: "vat-increased",
      label: "VAT franchise, increased threshold (sales of goods)",
      unit: "eur",
      limit: 93_500,
      note: "Measured on this year's turnover: VAT starts once it is exceeded.",
      sourceUrl: "https://entreprendre.service-public.gouv.fr/vosdroits/F21746",
    },
    {
      key: "dac7-sales",
      label: "Vinted tax-reporting (DAC7): number of sales",
      unit: "count",
      limit: 30, // "au moins 30 ventes": reaching it counts
      inclusive: true,
      note: "Per calendar year. Vinted reports the seller to the tax authority when either DAC7 threshold is reached; being reported does not by itself make sales taxable.",
      sourceUrl: "https://www.vinted.fr/help/1308",
    },
    {
      key: "dac7-amount",
      label: "Vinted tax-reporting (DAC7): amount received",
      unit: "eur",
      limit: 2_000, // "plus de 2 000 €": it has to be exceeded
      note: "Per calendar year.",
      sourceUrl: "https://www.vinted.fr/help/1308",
    },
  ],
  sources: [
    { label: "impots.gouv.fr: micro-entrepreneur ceilings", url: "https://www.impots.gouv.fr/professionnel/questions/pour-rester-micro-entrepreneur-quel-montant-de-chiffre-daffaires-ou-de" },
    { label: "service-public.fr: VAT franchise", url: "https://entreprendre.service-public.gouv.fr/vosdroits/F21746" },
    { label: "Vinted: what is DAC7", url: "https://www.vinted.fr/help/1308" },
    { label: "impots.gouv.fr: platform sales and DAC7", url: "https://www.impots.gouv.fr/transfert-dinformations-en-application-des-dispositifs-dpi-dac7-plateformes-deconomie-collaborative" },
    { label: "service-public.fr: selling your belongings online", url: "https://www.service-public.gouv.fr/particuliers/vosdroits/F31725" },
    { label: "Vinted: professional sales and Vinted Pro", url: "https://www.vinted.fr/help/1120-ventes-commerciales" },
    { label: "service-public.fr: livre des recettes and registre des achats", url: "https://entreprendre.service-public.gouv.fr/vosdroits/F23266" },
  ],
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// These figures go stale: after a year the screen says so instead of presenting them as current.
export function thresholdsAreStale(now: number, asOf = PRO_THRESHOLDS.asOf): boolean {
  return now - Date.parse(asOf) > YEAR_MS;
}
