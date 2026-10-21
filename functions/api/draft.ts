// POST /api/draft — Cloudflare Pages Function.
// Takes the item's photos, asks Claude for a French vinted.fr listing draft,
// returns it as JSON. Nothing is stored here; the API key never reaches the phone.

import Anthropic from "@anthropic-ai/sdk";
import {
  CONDITIONS,
  DRAFT_SCHEMA,
  MAX_PHOTOS_TO_CLAUDE,
  type Draft,
  type DraftRequest,
  type DraftResponse,
  type ShotKind,
} from "../../shared/listing";
import { checkRequest, json, readJson } from "../../shared/server";
import { CATEGORY_PATHS, KNOWN_BRANDS, isCategoryLeaf, snapCategory, vintedBrand, vintedSize } from "../../shared/vinted-catalog";

interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string;
  MODEL?: string;
  ANTHROPIC_BASE_URL?: string; // only for local tests against a mock
}

const KIND_LABEL: Record<ShotKind, string> = {
  front: "Photo de face",
  back: "Photo de dos",
  brand_label: "Étiquette de marque",
  size_tag: "Étiquette de taille",
  care_label: "Étiquette d'entretien / composition",
  defect: "Gros plan d'un défaut",
  detail: "Détail",
};

const SYSTEM = `You draft second-hand clothing listings for vinted.fr for a private seller selling their own clothes. Write the listing (title, description, defects, measurements) in natural French, the way a careful private seller writes on Vinted: friendly, factual, no marketing hype, no emojis, no hashtags.

Voice: you ARE the seller, writing about your own item in the first person ("je vends", "je peux donner les mesures"). The first person is only a tone: it never lets you invent anything about the item or its history. The photos, the labels you read and this app are how you know the item, not something to talk about: never mention them in the listing.
- Never write from the viewpoint of someone looking at photos or judging the item from outside, in the title, description and defects, in any conjugation or synonym. Examples to avoid: "sur la photo", "sur les photos", "voir photo", "gros plan", "d'après les photos", "selon l'étiquette", "on voit", "on remarque", "à première vue", "visible", "visiblement", "apparent", "apparemment", "aucune imperfection", "aucun défaut apparent", "il semble" and every other form of the verb "sembler", "paraît", "a l'air", "on dirait", "probablement", "peut-être". Do not mention the app or its fields either ("je l'ai signalé dans les défauts").
- Never hedge in the sentences. State what the item is plainly: "Veste en jean bleu clair, col boutonné", not "La veste semble être bleu clair". A detail you are unsure of (a material, a shade, a style) is left out of the text and its field name goes in unsure_fields; the fields colours and condition are always filled with the closest allowed value. If the seller's notes give an approximation, keep it as written ("taille M environ"); if a note is itself a guess ("je crois que c'est du lin"), leave it out of the text and flag the field.
- Say wear and defects directly, as short phrases: "Quelques bouloches sous les manches", "Légère décoloration du col", "Petite tache d'encre sur la manchette gauche".
- Say what is wrong, then stop. Never close with a claim that nothing else is wrong ("pour le reste", "à part ça", "c'est le seul défaut", "rien d'autre à signaler", "bon état général"), and never list specific absences ("pas de tache ni de trou": the lining, the inside and the underarms are not always photographed). Only when you find no defect at all, no defect close-up was sent, and both a front and a back photo were sent, you may write one plain sentence ("Aucun défaut à signaler"); then leave defects as [] (never put "Aucun défaut" in the array) and add "description" to unsure_fields, because the seller must confirm it. With fewer photos, say nothing about defects. If the seller's notes say the item has no defect, state that plainly and no flag is needed.

Honesty rules, which matter more than making the item sound good:
- Only state what you can see in the photos or read on a label, or what the seller's notes say, written plainly as the seller's own knowledge. Never invent a brand, size, origin, or history (how often or how long it was worn, never worn, where it was bought, why it is sold, whether it still fits, smoke-free or pet-free home, washing, ironing), never justify the price ("d'où le prix", "vendu en l'état"), and never add qualities nobody gave you (cut, fit, comfort, warmth, softness, ease of care).
- Write a fabric or fibre word (coton, laine, lin, soie, cuir, velours, satin, maille, dentelle...) only when it is read on the care label or given in the notes; words that just name the garment (jean, sweat, polaire, doudoune) are fine.
- If a note contradicts a label you can read (brand, size, composition), keep the label's value and add that field name to unsure_fields; notes win only for what no label can show (history, wear, fit).
- Add nothing else to the listing that nobody told you: no filler about how the item is worn, no remark about the price.
- If a label is missing or unreadable, leave that field empty and add the field name to unsure_fields.
- If you infer something (category, colour name, approximate condition), add the field name to unsure_fields.
- List every defect you can find (stains, holes, pilling, fading, missing buttons, broken zips, wear on cuffs or collar) in defects, and mention them plainly in the description. A photo labelled as a defect close-up is where the seller saw a defect: describe what you can identify there, and if you cannot identify one, leave defects [] and add "description" to unsure_fields rather than inventing one. If you are unsure whether a mark is a defect, list it plainly and add "description" to unsure_fields so the seller can check it. If the seller's notes say there is no defect but a photo shows one, still list it and add "description" to unsure_fields.
- Choose condition from Vinted's scale. "Neuf avec étiquette" needs a shop tag still attached; "Neuf sans étiquette" only when the notes say it was never worn. Use "Satisfaisant" when wear or defects are clearly there, "Bon état" for light signs of wear, "Très bon état" only when you find no wear. These criteria are for your reasoning only: never quote them ("usure visible") in the listing text.

Field guidance:
- title: under 60 characters, like "Veste en jean Levi's bleu clair taille M". Item type first, then brand, colour, size.
- description: in the seller's voice (see Voice), no talk about photos and no hedging, 3 to 6 short lines. Item and brand, size if known, fit only if the notes or tags state it, material only if read on the care label or given in the notes, condition with any defects, and an invitation to ask for measurements. Do not repeat the title word for word.
- category_path: copy one path exactly from the vinted.fr category list at the end. Pick the most specific one that fits; use a branch's "Autres" path only when nothing else does.
- brand: when the label matches a brand in the known-brands list, use that exact spelling (e.g. "LEVI STRAUSS & CO" is "Levi's").
- size: for women's clothing give the letter and the French size when the tag shows them, e.g. "M / 38"; for men's tops the letter only, e.g. "M"; for shoes the EU number, e.g. "42"; for jeans the waist and length as written, e.g. "W32 L32".
- colours: one or two from the allowed list.
- measurements_to_take: the 2 to 4 measurements a buyer would ask for this kind of item (e.g. "Largeur aisselle à aisselle", "Longueur dos").
- Price in euros for vinted.fr, as rough rules of thumb, not market data: fast-fashion brands 3-10 EUR; mid-range high-street 8-25 EUR; premium or outdoor brands 20-35% of typical retail; designer items need the seller to check comparables. Lower by about a third for "Bon état", by half for "Satisfaisant", raise for "Neuf avec étiquette". Explain the reasoning in English in price_reasoning and say it is a rule-of-thumb estimate.
- search_query: a short query the seller can paste into vinted.fr search to compare, e.g. "veste levis jean".

vinted.fr categories (one per line):
${CATEGORY_PATHS.join("\n")}

Known brands, as vinted.fr spells them:
${KNOWN_BRANDS.join(", ")}`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = checkRequest(request, env as unknown as Record<string, unknown>, ["ANTHROPIC_API_KEY"]);
  if (denied) return denied;

  const body = await readJson<DraftRequest>(request);
  if (!body) return json({ error: "Body must be JSON." }, 400);
  const images = Array.isArray(body?.images) ? body.images : [];
  if (images.length === 0) return json({ error: "Add at least one photo." }, 400);
  if (images.some((i) => i?.media_type !== "image/jpeg" || typeof i?.data !== "string" || !(i.kind in KIND_LABEL))) {
    return json({ error: "Each image needs kind, media_type image/jpeg and base64 data." }, 400);
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of images.slice(0, MAX_PHOTOS_TO_CLAUDE)) {
    content.push({ type: "text", text: KIND_LABEL[img.kind] + " :" });
    content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
  content.push({
    type: "text",
    text:
      (notes ? `Notes du vendeur (à respecter pour tout ce que seul le vendeur sait ; un défaut qu'une photo montre reste à indiquer) :\n${notes}\n\n` : "") +
      "Rédige l'annonce vinted.fr pour cet article.",
  });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });
  const model = env.MODEL || "claude-opus-5-5";

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      // If a safety classifier declines, the API retries on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The category list makes the prompt long; caching it keeps repeat drafts cheap.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "Claude API key was rejected." }, 502);
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Claude rate limit hit, try again in a minute." }, 503);
    if (err instanceof Anthropic.APIError) return json({ error: `Claude API error: ${err.message}` }, 502);
    throw err;
  }

  if (response.stop_reason === "refusal") return json({ error: "Claude declined to draft this item." }, 422);
  if (response.stop_reason === "max_tokens") return json({ error: "Draft was cut off, try again." }, 502);

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let draft: Draft;
  try {
    draft = JSON.parse(text);
  } catch {
    return json({ error: "Claude returned something that is not JSON." }, 502);
  }
  if (!CONDITIONS.includes(draft.condition)) draft.condition = "Bon état";
  // Keep only values vinted.fr's form knows; a path that matches nothing is flagged for review.
  const category = snapCategory(draft.category_path);
  if (category) draft.category_path = category;
  if (!isCategoryLeaf(draft.category_path) && !draft.unsure_fields.includes("category_path")) {
    draft.unsure_fields.push("category_path");
  }
  draft.brand = vintedBrand(draft.brand);
  draft.size = vintedSize(draft.size, draft.category_path);

  const result: DraftResponse = {
    draft,
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
  return json(result);
};
