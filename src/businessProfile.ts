// Who is selling: the details a business seller needs on exports and receipts. Stored on this device
// and included in backups. The "sells as a business" switch also decides whether the Pro tab shows.
import { PROFILE_EVENT, PROFILE_KEY } from "./proFlag";

export type Activity = "micro" | "company" | "other";
export type VatRegime = "franchise" | "subject";

export interface BusinessProfile {
  sellsAsBusiness: boolean;
  legalName: string;
  siret: string;
  activity: Activity;
  vatRegime: VatRegime;
  address: string;
  receiptFooter: string;
}

export const EMPTY_PROFILE: BusinessProfile = {
  sellsAsBusiness: false,
  legalName: "",
  siret: "",
  activity: "micro",
  vatRegime: "franchise",
  address: "",
  receiptFooter: "",
};

const ACTIVITIES: Activity[] = ["micro", "company", "other"];
const VAT_REGIMES: VatRegime[] = ["franchise", "subject"];

// Anything unreadable or of the wrong type falls back to the default for that field.
export function parseProfile(raw: string | null): BusinessProfile {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
  } catch {
    // keep the defaults
  }
  const text = (k: keyof BusinessProfile) => (typeof data[k] === "string" ? (data[k] as string) : EMPTY_PROFILE[k] as string);
  return {
    sellsAsBusiness: data.sellsAsBusiness === true,
    legalName: text("legalName"),
    siret: text("siret"),
    activity: ACTIVITIES.includes(data.activity as Activity) ? (data.activity as Activity) : EMPTY_PROFILE.activity,
    vatRegime: VAT_REGIMES.includes(data.vatRegime as VatRegime) ? (data.vatRegime as VatRegime) : EMPTY_PROFILE.vatRegime,
    address: text("address"),
    receiptFooter: text("receiptFooter"),
  };
}

export function readProfile(): BusinessProfile {
  try {
    return parseProfile(localStorage.getItem(PROFILE_KEY));
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(profile: BusinessProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // blocked storage: the profile is not kept
  }
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

const digits = (s: string) => s.replace(/\s/g, "");

// 14 digits, then the Luhn check. The establishments of La Poste (SIREN 356 000 000) use another rule:
// the digits add up to a multiple of 5.
export function isValidSiret(input: string): boolean {
  const s = digits(input);
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith("356000000")) return [...s].reduce((n, d) => n + Number(d), 0) % 5 === 0;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(s[13 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// A warning, never a block: a mistyped number is worth flagging, but the user knows their own SIRET.
export function siretWarning(input: string): string | undefined {
  const s = digits(input);
  if (s === "") return undefined;
  if (!/^\d{14}$/.test(s)) return "A SIRET has 14 digits.";
  return isValidSiret(s) ? undefined : "This number does not pass the SIRET check digit. Double-check it.";
}
