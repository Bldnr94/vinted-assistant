// What Gemini is asked to do in the Photos step (in English: Gemini follows it best), and the
// background choice that feeds the first prompt.

export type BackdropId = "wood" | "linen" | "wall" | "plain";

export const BACKDROPS: { id: BackdropId; label: string; prompt: string }[] = [
  { id: "wood", label: "Wood floor", prompt: "a clean, light wooden floor" },
  { id: "linen", label: "White sheet", prompt: "a smooth white bed sheet" },
  { id: "wall", label: "Light wall", prompt: "a plain light-coloured wall" },
  { id: "plain", label: "Plain studio", prompt: "a seamless light-grey studio backdrop" },
];

const CHOICE_KEY = "studio-backdrop";

// The chat app the manual "by hand" route hands the photos to. Same prompt for both. ChatGPT is
// manual only: OpenAI's terms forbid extracting its output automatically, so the extension
// never drives chatgpt.com.
export type ManualApp = "gemini" | "chatgpt";
export const MANUAL_APPS: { id: ManualApp; label: string; url: string }[] = [
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
];
const APP_KEY = "manual-image-app";

export function readManualApp(): ManualApp {
  try {
    return localStorage.getItem(APP_KEY) === "chatgpt" ? "chatgpt" : "gemini";
  } catch {
    return "gemini";
  }
}

export function saveManualApp(id: ManualApp) {
  try {
    localStorage.setItem(APP_KEY, id);
  } catch {
    // Falls back to Gemini next time.
  }
}

export function readBackdrop(): BackdropId {
  try {
    const id = localStorage.getItem(CHOICE_KEY) as BackdropId | null;
    return BACKDROPS.some((b) => b.id === id) ? id! : "wood"; // an old "own" choice falls back to wood
  } catch {
    return "wood";
  }
}

export function saveBackdrop(id: BackdropId) {
  try {
    localStorage.setItem(CHOICE_KEY, id);
  } catch {
    // Falls back to the wood floor next time.
  }
}

// One photo in, same photo out with only the background redrawn.
export const backgroundPrompt = (id: BackdropId) =>
  [
    "This is a photo of a clothing item I am selling second-hand.",
    `Replace only the background: lay the garment on ${BACKDROPS.find((b) => b.id === id)?.prompt ?? BACKDROPS[0].prompt}, with soft natural lighting and a gentle shadow under it. Remove clutter, hangers, hands and furniture around it.`,
    "Keep the garment exactly as it is: same shape and size, same colour and shade, fabric texture, wrinkles, print, logo, buttons and stitching, and keep every stain, hole or defect visible. Do not clean, fix, recolour, add or remove anything on the garment.",
    "Keep the same orientation, garment centred and fully visible, portrait 3:4. Photo-realistic, no text, no watermark.",
  ].join(" ");

// Image 1 is the model photo, image 2 the garment (the extension attaches them in that order).
// Written on separate lines for the copy-paste route; the extension gets it through oneLine().
export const tryOnPrompt = (styling: string) =>
  `You are a photo-realistic virtual try-on editor.

INPUTS
- Image 1: the person (the base photo).
- Image 2: the clothing item to put on them. It is a second-hand seller's own photo: the item may be laid flat, on a hanger or worn. Use only the item itself, never the hanger, tags, hands, mannequin, bed, floor or background around it.

TASK
Dress the person in image 1 in the garment from image 2, so it looks like a real photo of them actually wearing it.

1. IDENTIFY THE GARMENT
Determine the garment's category (top, outer layer, bottom, dress, jumpsuit, etc.) and how it is meant to be worn (worn closed or open, tucked or untucked, layered over or under other pieces). Use how it appears in image 2 to decide.${
    styling ? `\nStyling asked by the seller, which overrides your own choice: ${styling}.` : ""
  }

2. HANDLE THE EXISTING OUTFIT
Decide what happens to each piece the person already wears:
- Same category (e.g. new T-shirt, existing T-shirt): replace the existing piece entirely. No trace of it should remain (collar, sleeves, hem, print).
- Layering garment (jacket, coat, cardigan, overshirt, vest): keep the existing top and show it naturally underneath (collar, neckline, hem). Adjust only where the new layer would realistically cover it.
- Full-coverage garment (dress, jumpsuit, long coat): remove or hide the pieces it replaces or covers, and keep only what would realistically still be visible (e.g. shoes, a layer worn over it).
- Garment that exposes more of the body (shorts, skirt, sleeveless top): render the newly exposed skin consistent with the person's visible skin tone, lighting and body shape. Do not add tattoos, marks or other details.
- Garment that changes the silhouette (tucked vs untucked, cropped vs long, high vs low waist): adapt the neighbouring clothes so the outfit stays coherent, e.g. tuck or untuck an existing top, or let the new top cover or reveal the waistband.
- Pieces that are not affected (the other clothes, shoes, accessories): keep them exactly as they are.
Only change an existing piece when the new garment makes it necessary. The result must be a coherent, believable outfit, with no clipping, no doubled layers, and no pieces floating or ending abruptly.

3. FIT AND PHYSICS
- Put the garment on this person's real body, pose and proportions (shoulders, chest, waist, hips, arm and leg length), keeping its own cut: an oversized piece stays oversized, a cropped one stays cropped, a straight one stays straight. Do not make it look more fitted or more flattering than its cut allows.
- Follow the pose: natural folds, tension, stretch and drape where the body bends, and gravity where fabric hangs.
- Keep every seam, hem, collar and cuff aligned with the body, and make transitions between the new garment and the remaining clothes clean and realistic.
- Respect everything in front of the garment: the phone, hands and arms stay in front and keep their exact shape and position. Hair, straps and accessories stay in their original layer order.

4. EXACT GARMENT FIDELITY
Reproduce the item from image 2 exactly: colour and shade, fabric, texture and weave, print or pattern, logo and text (position, size, spelling, and the same way round as in image 2), buttons, zips, pockets, seams, stitching, length and cut. Do not add, remove, simplify or invent any detail. Keep its real condition: any visible stain, hole, pilling, fading or wear stays visible, and do not make it look newer, brighter or freshly ironed. If part of the garment is hidden in image 2, extend it in the most plausible way consistent with its visible design, without adding new elements. Adapt only the lighting and shadows to the scene, not the garment's colour or material.

5. KEEP EVERYTHING ELSE IDENTICAL
Do not alter the person (identity, body shape, skin, pose, hair), the phone hiding the face, the mirror and its reflection logic, the room, the background, the camera angle or the framing. Do not show or add a face. The garment must also appear correctly in the mirror reflection if the reflection is visible.

6. REALISM
Match the scene's lighting direction, colour temperature, shadows, grain, sharpness and exposure. The new garment should cast and receive shadows (neck, arms, phone, folds) like the rest of the photo. Keep the casual phone-photo look of image 1: do not retouch, beautify, smooth skin or make it look like a studio or catalogue shot. No visible edges, halos, cut-out look or AI artifacts.

OUTPUT
One photo-realistic image, same size, aspect ratio and orientation as image 1, with no text, borders or watermarks added.`;

// The extension types the prompt into Gemini's Quill editor, where a typed line break moves the
// caret and scrambles the rest of the text, so automated jobs get it on a single line.
export const oneLine = (prompt: string) => prompt.replace(/\s*\n\s*/g, " ");
