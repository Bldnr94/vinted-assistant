// Shared between the phone app (src/) and the draft endpoint (functions/).

// Condition values exactly as vinted.fr shows them in the sell form.
export const CONDITIONS = [
  "Neuf avec étiquette",
  "Neuf sans étiquette",
  "Très bon état",
  "Bon état",
  "Satisfaisant",
] as const;
export type Condition = (typeof CONDITIONS)[number];

// Colour names as used on vinted.fr. Correct this list if the form differs.
export const COLOURS = [
  "Noir", "Gris", "Blanc", "Crème", "Beige", "Abricot", "Orange", "Corail",
  "Rouge", "Bordeaux", "Rose", "Violet", "Lilas", "Bleu clair", "Bleu",
  "Marine", "Turquoise", "Menthe", "Vert", "Vert foncé", "Kaki", "Marron",
  "Moutarde", "Jaune", "Argenté", "Doré", "Multicolore",
] as const;

export type ShotKind =
  | "front"
  | "back"
  | "brand_label"
  | "size_tag"
  | "care_label"
  | "defect"
  | "detail";

export const SHOTS: { kind: ShotKind; label: string; hint: string; required: boolean }[] = [
  { kind: "front", label: "Front", hint: "Whole item, flat or on a hanger, daylight", required: true },
  { kind: "back", label: "Back", hint: "Whole item from behind", required: true },
  { kind: "brand_label", label: "Brand label", hint: "Sharp, readable", required: true },
  { kind: "size_tag", label: "Size tag", hint: "Sharp, readable", required: true },
  { kind: "care_label", label: "Care label", hint: "Shows the material composition", required: false },
  { kind: "defect", label: "Defects", hint: "Every stain, hole, pilling or wear, close up", required: false },
  { kind: "detail", label: "Details", hint: "Buttons, print, texture", required: false },
];

// Photo order on the listing: real photos, in this order of kind.
export const SHOT_ORDER: ShotKind[] = SHOTS.map((s) => s.kind);

export interface Draft {
  title: string;
  description: string;
  brand: string;
  category_path: string;
  size: string;
  colours: string[];
  materials: string;
  condition: Condition;
  defects: string[];
  measurements_to_take: string[];
  price_min_eur: number;
  price_max_eur: number;
  price_suggested_eur: number;
  price_reasoning: string;
  unsure_fields: string[];
  search_query: string;
}

// JSON schema for Claude's structured output. Must match Draft.
export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "description", "brand", "category_path", "size", "colours",
    "materials", "condition", "defects", "measurements_to_take",
    "price_min_eur", "price_max_eur", "price_suggested_eur",
    "price_reasoning", "unsure_fields", "search_query",
  ],
  properties: {
    title: { type: "string", description: "Titre en français, court : type, marque, couleur, taille" },
    description: { type: "string", description: "Description en français, écrite par le vendeur à la première personne, honnête, défauts inclus. Jamais de point de vue d'observateur ni d'hésitation (« sur la photo », « on voit », « il semble », « apparent »), jamais de détail inventé (coupe, confort, historique, raison de la vente), jamais de « pour le reste, rien à signaler », jamais de matière qui ne figure ni sur l'étiquette d'entretien ni dans les notes. Une seule phrase « Aucun défaut à signaler » est permise seulement si aucun défaut n'est trouvé, qu'aucun gros plan de défaut n'a été fourni et que photos de face et de dos sont présentes : sauf si les notes le confirment, ajouter description à unsure_fields" },
    brand: { type: "string", description: "Marque lue sur l'étiquette, vide si illisible" },
    category_path: { type: "string", description: "Chemin de catégorie vinted.fr, par ex. Femmes > Vêtements > Manteaux et vestes > Vestes" },
    size: { type: "string", description: "Taille lue sur l'étiquette, par ex. M / FR 38, vide si illisible" },
    colours: { type: "array", items: { type: "string", enum: [...COLOURS] } },
    materials: { type: "string", description: "Composition lue sur l'étiquette d'entretien, vide si absente" },
    condition: { type: "string", enum: [...CONDITIONS] },
    defects: { type: "array", items: { type: "string" }, description: "Un défaut par entrée, formulé par le vendeur, en français (par ex. « Petite tache sur la manche gauche »), sans « visible » ni « sur la photo ». Tableau vide s'il n'y en a aucun, jamais « Aucun défaut » comme entrée" },
    measurements_to_take: { type: "array", items: { type: "string" }, description: "Mesures utiles à prendre, en français" },
    price_min_eur: { type: "number" },
    price_max_eur: { type: "number" },
    price_suggested_eur: { type: "number" },
    price_reasoning: { type: "string", description: "In English, 1-3 sentences" },
    unsure_fields: { type: "array", items: { type: "string" }, description: "Names of Draft fields (e.g. condition, description, size, category_path) that are guesses or that the seller must confirm" },
    search_query: { type: "string", description: "Short vinted.fr search for comparable items, e.g. brand + item type" },
  },
} as const;

export interface DraftImage {
  kind: ShotKind;
  media_type: "image/jpeg";
  data: string; // base64, no data: prefix
}

export interface DraftRequest {
  images: DraftImage[];
  notes: string;
}

export interface DraftResponse {
  draft: Draft;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export const MAX_PHOTOS = 20; // Vinted's limit per listing
export const MAX_PHOTOS_TO_CLAUDE = 10; // keeps the draft call around 0.10 USD

export const AI_NOTICE =
  "Les photos portées sont des illustrations générées par IA. Les autres photos montrent l'article réel.";
