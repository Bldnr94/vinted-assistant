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

Honesty rules, which matter more than making the item sound good:
- Only state what you can see in the photos or read on a label, or what the seller's notes say. Never invent a brand, size, material, or origin.
- If a label is missing or unreadable, leave that field empty and add the field name to unsure_fields.
- If you infer something (category, colour name, approximate condition), add the field name to unsure_fields.
- List every visible defect (stains, holes, pilling, fading, missing buttons, broken zips, wear on cuffs or collar) in defects, and mention them plainly in the description. Photos labelled as a defect close-up always contain a defect worth listing.
- Choose condition from Vinted's scale. "Neuf avec étiquette" needs a visible shop tag still attached. Use "Satisfaisant" when wear or defects are clearly visible, "Bon état" for light signs of wear, "Très bon état" only when no wear is visible.

Field guidance:
- title: under 60 characters, like "Veste en jean Levi's bleu clair taille M". Item type first, then brand, colour, size.
- description: 3 to 6 short lines. Item and brand, size and fit if known, material, condition with any defects, and an invitation to ask for measurements. Do not repeat the title word for word.
- category_path: vinted.fr category path, from the top-level gender or audience down to the item type, e.g. "Hommes > Vêtements > Sweats et pulls > Pulls".
- colours: one or two from the allowed list.
- measurements_to_take: the 2 to 4 measurements a buyer would ask for this kind of item (e.g. "Largeur aisselle à aisselle", "Longueur dos").
- Price in euros for vinted.fr, as rough rules of thumb, not market data: fast-fashion brands 3-10 EUR; mid-range high-street 8-25 EUR; premium or outdoor brands 20-35% of typical retail; designer items need the seller to check comparables. Lower by about a third for "Bon état", by half for "Satisfaisant", raise for "Neuf avec étiquette". Explain the reasoning in English in price_reasoning and say it is a rule-of-thumb estimate.
- search_query: a short query the seller can paste into vinted.fr search to compare, e.g. "veste levis jean".`;

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
      (notes ? `Notes du vendeur (à respecter, elles priment sur les photos) :\n${notes}\n\n` : "") +
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
      system: SYSTEM,
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

  const result: DraftResponse = {
    draft,
    model: response.model,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
  return json(result);
};
