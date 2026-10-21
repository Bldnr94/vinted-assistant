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
export const tryOnPrompt = (styling: string) =>
  [
    "Image 1 is a person, image 2 is a clothing item.",
    "Dress the person in image 1 in the clothing item from image 2.",
    "Keep everything else in image 1 exactly as it is: the person, body, pose, the phone hiding the face, hair, the mirror, the room, the light and the framing.",
    "Copy the clothing item exactly: same colour and shade, fabric, texture, print, logo, buttons, pockets, seams, length and cut. Do not add, remove or invent any detail.",
    "Replace only the piece of clothing it replaces; keep the other clothes and the shoes.",
    styling ? `Styling: ${styling}.` : "",
    "Photo-realistic, same size and format as image 1.",
  ]
    .filter(Boolean)
    .join(" ");
