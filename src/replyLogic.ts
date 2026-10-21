// Ready-to-copy French answers to common buyer questions, built on the phone from the item's
// details. Nothing is sent from here: you copy a reply and paste it into Vinted's chat yourself.
import type { Condition } from "../shared/listing";
import type { Item } from "./db";

export interface ReplySettings {
  tutoie: boolean; // "tu" instead of "vous"
  bundlePct: number; // discount on a bundle of 2+ items
  offerFloorPct: number; // how far below the listed price you accept to go
  shipDays: string; // e.g. "1 à 2 jours"
  shippingNote: string;
  signature: string;
}

export const DEFAULT_REPLY_SETTINGS: ReplySettings = {
  tutoie: false,
  bundlePct: 10,
  offerFloorPct: 10,
  shipDays: "1 à 2 jours",
  shippingNote: "Le colis est emballé avec soin.",
  signature: "",
};

const SETTINGS_KEY = "reply-settings";

export function readReplySettings(): ReplySettings {
  try {
    return { ...DEFAULT_REPLY_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_REPLY_SETTINGS;
  }
}

export function saveReplySettings(s: ReplySettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Defaults come back next time.
  }
}

// Measured values in cm, keyed by measurement name. Kept on the item record itself
// (IndexedDB stores whatever object we put), so no database upgrade is needed.
export type ItemWithMeasures = Item & { measurements?: Record<string, string> };

export const FALLBACK_MEASURES = ["Longueur", "Largeur d'aisselle à aisselle"];

export function measureNames(item: Item): string[] {
  const names = item.draft?.measurements_to_take ?? [];
  return names.length ? names : FALLBACK_MEASURES;
}

export interface Reply {
  key: string;
  label: string;
  text: string;
  incomplete?: string; // why the reply still needs something from you
}

const CONDITION_TEXT: Record<Condition, string> = {
  "Neuf avec étiquette": "L'article est neuf, jamais porté, avec son étiquette.",
  "Neuf sans étiquette": "L'article est neuf, jamais porté, sans étiquette.",
  "Très bon état": "L'article est en très bon état.",
  "Bon état": "L'article est en bon état.",
  "Satisfaisant": "L'article est en état satisfaisant, avec des signes d'usure.",
};

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cm = (v: string) => `${v.trim().replace(/\s*cm$/i, "")} cm`;

export function listedPrice(item: Item): number {
  return item.listedPrice ?? item.draft?.price_suggested_eur ?? 0;
}

export function buildReplies(item: ItemWithMeasures, s: ReplySettings): Reply[] {
  const d = item.draft;
  if (!d) return [];
  const v = (tu: string, vous: string) => (s.tutoie ? tu : vous);
  const sign = (text: string) => (s.signature.trim() ? `${text}\n${s.signature.trim()}` : text);
  const replies: Reply[] = [];
  const add = (r: Reply) => replies.push({ ...r, text: sign(r.text) });

  add({
    key: "available",
    label: "Still available?",
    text: `Bonjour ! Oui, l'article est toujours disponible. ${v("N'hésite pas si tu as", "N'hésitez pas si vous avez")} des questions.`,
  });

  const names = measureNames(item);
  const values = item.measurements ?? {};
  const missing = names.filter((n) => !values[n]?.trim());
  const parts = names.map((n) => `${lowerFirst(n)} ${values[n]?.trim() ? cm(values[n]) : "[à mesurer]"}`);
  add({
    key: "measures",
    label: "Measurements and size",
    text:
      `Bonjour ! Voici les mesures, prises à plat : ${parts.join(", ")}.` +
      (d.size ? ` Taille indiquée sur l'étiquette : ${d.size}.` : ""),
    incomplete: missing.length ? `Fill in ${missing.length === 1 ? "1 measurement" : `${missing.length} measurements`} above.` : undefined,
  });

  const defects = d.defects.filter(Boolean);
  add({
    key: "condition",
    label: "Condition and defects",
    text:
      `Bonjour ! ${CONDITION_TEXT[d.condition] ?? `État : ${d.condition}.`} ` +
      (defects.length
        ? `À noter : ${defects.map(lowerFirst).join(" ; ")}. C'est visible sur les photos.`
        : `Je n'ai remarqué aucun défaut, ${v("tu peux", "vous pouvez")} tout voir sur les photos.`) +
      (d.materials ? ` Composition : ${d.materials}.` : ""),
  });

  add({
    key: "bundle",
    label: "Bundle discount",
    text:
      `Oui, avec plaisir ! Je fais ${s.bundlePct} % de réduction à partir de 2 articles. ` +
      `${v("Ajoute ce qui te plaît", "Ajoutez ce qui vous plaît")} dans un lot depuis mon dressing et je ${v("t'envoie", "vous envoie")} une offre.`,
  });

  const price = listedPrice(item);
  const floor = Math.max(1, Math.round(price * (1 - s.offerFloorPct / 100)));
  add({
    key: "offer",
    label: "Offer too low",
    text: `Merci pour ${v("ton", "votre")} offre ! Je ne peux pas descendre aussi bas, mais je peux faire ${floor} €. ${v("Dis-moi si ça te va", "Dites-moi si cela vous convient")}.`,
    incomplete: price ? undefined : "No price on this item yet.",
  });

  add({
    key: "shipping",
    label: "Shipping",
    text: `J'envoie sous ${s.shipDays} après l'achat. ${s.shippingNote}`.trim(),
  });

  add({
    key: "reserve",
    label: "Can you hold it?",
    text: `Je ne réserve pas les articles, mais il reste en vente tant que personne ne l'achète. Le plus sûr est de l'acheter directement.`,
  });

  add({
    key: "thanks",
    label: "Thanks after a sale",
    text: `Merci pour ${v("ton", "votre")} achat ! J'envoie le colis sous ${s.shipDays}. Bonne journée !`,
  });

  return replies;
}
