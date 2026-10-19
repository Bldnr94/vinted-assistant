// vinted.fr's own category, size and brand names, so drafts use values the sell form accepts.
// Shared between the phone app (src/) and the draft endpoint (functions/).
//
// Categories were read from vinted.fr's public catalog pages on 2026-10-19. Vinted renames
// categories now and then: when the form script says "no match", fix the path here.

const tree = (root: string, branches: Record<string, string[]>): string[] =>
  Object.entries(branches).flatMap(([branch, leaves]) =>
    leaves.length ? leaves.map((leaf) => `${root} > ${branch} > ${leaf}`) : [`${root} > ${branch}`],
  );

const FEMMES_VETEMENTS = "Femmes > Vêtements";
const HOMMES_VETEMENTS = "Hommes > Vêtements";

export const CATEGORY_PATHS: string[] = [
  ...tree(FEMMES_VETEMENTS, {
    "Manteaux et vestes > Manteaux": [
      "Pardessus et manteaux longs", "Manteaux en fausse fourrure", "Trenchs", "Parkas", "Cabans",
      "Imperméables", "Duffle-coats",
    ],
    "Manteaux et vestes > Vestes": [
      "Vestes en jean", "Doudounes", "Perfectos et blousons de moto", "Blousons aviateur", "Vestes chemises",
      "Vestes matelassées", "Vestes polaires", "Vestes coupe-vent", "Vestes militaires et utilitaires",
      "Blousons teddy", "Vestes de ski et snowboard",
    ],
    "Manteaux et vestes": ["Vestes sans manches", "Capes et ponchos"],
    "Sweats et sweats à capuche": [
      "Sweats > Pulls col V", "Sweats", "Sweats & sweats à capuche", "Cardigans", "Vestes",
      "Autres pull-overs & sweat-shirts", "Boléros", "Kimonos",
    ],
    "Hauts et t-shirts": [
      "Blouses", "T-shirts", "Chemises", "Tops courts", "Blouses manches longues", "Débardeurs",
      "Blouses manches courtes", "Bodies", "Tops épaules dénudées", "Autres hauts", "Blouses ¾",
      "Tops dos nu", "Tuniques", "Cols roulés", "Tops peplum",
    ],
    Robes: [
      "Robes d'été", "Robes longues", "Pour occasions", "Mini", "Petites robes noires", "Midi",
      "Robes casual", "Robes d'hiver", "Robes chics", "Autres robes", "Robes en jean", "Robes sans bretelles",
    ],
    Jeans: [
      "Jeans droits", "Jeans skinny", "Jeans taille haute", "Jeans évasés", "Jeans troués", "Jeans boyfriend",
      "Jeans courts", "Autre",
    ],
    "Pantalons et leggings": [
      "Pantalons à jambes larges", "Pantalons droits", "Leggings", "Pantalons en cuir", "Pantalons skinny",
      "Pantalons courts & chinos", "Pantalons ajustés", "Sarouels", "Autres pantalons",
    ],
    Jupes: ["Minijupes", "Jupes longues", "Jupes longueur genou", "Jupes midi", "Jupes asymétriques"],
    "Blazers et tailleurs": [
      "Blazers", "Ensembles tailleur/pantalon", "Jupes et robes tailleurs", "Tailleurs pièces séparées",
      "Autres ensembles & tailleurs",
    ],
    Shorts: [
      "Short en jean", "Shorts taille haute", "Shorts taille basse", "Pantacourts", "Shorts longueur genou",
      "Shorts en cuir", "Shorts cargo", "Shorts en dentelle", "Autres shorts",
    ],
    "Vêtements de sport": [
      "Hauts & t-shirts", "Survêtements", "Shorts", "Pantalons & leggings", "Brassières",
      "Accessoires de sports", "Vêtements d'extérieur", "Robes", "Sweats et sweats à capuche", "Jupes",
      "Maillots", "Autres",
    ],
    "Combinaisons et combishorts": [],
    "Jupes-shorts": [],
    "Lingerie et pyjamas": [],
    "Maillots de bain": [],
    Maternité: [],
    "Costumes et tenues particulières": [],
    Autres: [],
  }),
  ...tree("Femmes", {
    Chaussures: [
      "Baskets", "Chaussures à talons", "Bottes", "Sandales", "Chaussures de sport", "Claquettes et tongs",
      "Mocassins et chaussures bateau", "Ballerines", "Chaussures à lacets", "Mules et sabots", "Espadrilles",
      "Chaussons et pantoufles", "Babies et Mary-Jane",
    ],
    Sacs: [
      "Sacs à main", "Sacs à bandoulière", "Porte-monnaie", "Sacs fourre-tout", "Pochettes", "Sacs à dos",
      "Trousses à maquillage", "Sacs banane", "Sacs de plage", "Sacs seau", "Besaces", "Wristlets",
      "Fourre-tout et sacs marins", "Sacs de voyage", "Sacs de sport", "Cartables et sacoches",
      "Housses pour vêtements", "Mallettes",
    ],
    Accessoires: [
      "Bijoux", "Lunettes de soleil", "Chapeaux & casquettes", "Écharpes et châles", "Ceintures", "Montres",
      "Porte-clés", "Accessoires pour cheveux", "Bandanas et foulards pour cheveux", "Gants",
      "Mouchoirs de poche", "Parapluies", "Autres accessoires",
    ],
  }),
  ...tree(HOMMES_VETEMENTS, {
    "Manteaux et vestes > Manteaux": [
      "Parkas", "Pardessus et manteaux longs", "Imperméables", "Trenchs", "Cabans", "Duffle-coats",
    ],
    "Manteaux et vestes > Vestes": [
      "Vestes coupe-vent", "Doudounes", "Blousons aviateur", "Perfectos et blousons de moto", "Vestes polaires",
      "Vestes chemises", "Vestes matelassées", "Vestes en jean", "Vestes militaires et utilitaires",
      "Vestes Harrington", "Blousons teddy", "Vestes de ski et snowboard",
    ],
    "Manteaux et vestes": ["Vestes sans manches", "Ponchos"],
    "Hauts et t-shirts": ["T-shirts", "Chemises", "Polos", "T-shirts sans manches"],
    "Sweats et pulls": [
      "Pulls et pulls à capuche", "Sweats", "Pulls ras de cou", "Pulls à capuche avec zip", "Sweats à col V",
      "Pulls d'hiver", "Cardigans", "Pulls à col roulé", "Vestes", "Sweats longs", "Autres",
    ],
    Pantalons: [
      "Jogging", "Chinos", "Pantalons à jambes larges", "Pantalons de costume", "Pantalons skinny",
      "Pantacourts", "Autres pantalons",
    ],
    Jeans: ["Jeans coupe droite", "Jeans slim", "Jeans troués", "Jeans skinny"],
    "Costumes et blazers": [
      "Blazers", "Ensembles costume", "Pantalons de costume", "Gilets de costume", "Costumes de mariage", "Autres",
    ],
    Shorts: ["Shorts en jean", "Shorts chino", "Shorts cargo", "Autres shorts"],
    "Vêtements de sport et accessoires": [],
    "Sous-vêtements et chaussettes": [],
    "Maillots de bain": [],
    Pyjamas: [],
    "Vêtements spécialisés et costumes": [],
    Autres: [],
  }),
  ...tree("Hommes", {
    Chaussures: [
      "Baskets", "Chaussures de sport", "Bottes", "Chaussures habillées", "Mocassins et chaussures bateau",
      "Claquettes et tongs", "Sandales", "Chaussons et pantoufles", "Mules et sabots", "Espadrilles",
    ],
    Accessoires: [
      "Chapeaux et casquettes", "Sacs et sacoches", "Montres", "Cravates et nœuds papillons", "Bijoux",
      "Lunettes de soleil", "Ceintures", "Écharpes et châles", "Gants", "Bandanas et foulards pour cheveux",
      "Bretelles", "Pochettes de costume", "Mouchoirs de poche", "Autres",
    ],
  }),
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s*&\s*/g, " et ")
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ")
    .trim();

const BY_NORM = new Map(CATEGORY_PATHS.map((p) => [norm(p), p]));

// Turns a path Claude wrote into one from the list: exact match or a branch of the tree, else the path ending in the
// same item type under the same audience ("Femmes"/"Hommes"), else the same branch ("Femmes >
// Vêtements > Robes" for "Femmes > Robes > Robe pull"). Returns null when nothing fits.
export function snapCategory(path: string): string | null {
  const n = norm(path || "");
  if (!n) return null;
  const exact = BY_NORM.get(n);
  if (exact) return exact;
  // A branch ("... > Manteaux et vestes > Vestes") stays a branch: the seller picks the last level.
  const below = CATEGORY_PATHS.find((p) => norm(p).startsWith(n + " > "));
  if (below) return below.split(" > ").slice(0, n.split(" > ").length).join(" > ");
  const parts = n.split(" > ");
  const audience = parts[0];
  const candidates = CATEGORY_PATHS.filter((p) => norm(p).startsWith(audience + " > "));
  for (let i = parts.length - 1; i > 0; i--) {
    const tail = parts.slice(i).join(" > ");
    const hits = candidates.filter((p) => norm(p).endsWith(" > " + tail));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) {
      // Several paths end the same way ("Vestes"): keep the one sharing most earlier levels.
      const score = (p: string) => norm(p).split(" > ").filter((x) => parts.includes(x)).length;
      return hits.sort((a, b) => score(b) - score(a))[0];
    }
  }
  return null;
}

// Women's clothing sizes as vinted.fr writes them: letter / FR / UK.
const WOMEN_SIZES = [
  ["XXXS", "30", "2"], ["XXS", "32", "4"], ["XS", "34", "6"], ["S", "36", "8"], ["M", "38", "10"],
  ["L", "40", "12"], ["XL", "42", "14"], ["XXL", "44", "16"], ["XXXL", "46", "18"], ["4XL", "48", "20"],
  ["5XL", "50", "22"], ["6XL", "52", "24"],
];

// "M", "38", "FR 38", "T38" or "M / FR 38" on a women's clothing item -> "M / 38 / 10".
// Other categories keep the size as read (men's tops are a plain letter, shoes a number).
export function vintedSize(size: string, categoryPath: string): string {
  const s = String(size || "").trim();
  if (!s || !categoryPath.startsWith(FEMMES_VETEMENTS)) return s;
  const tokens = s.toUpperCase().replace(/\b(FR|EU|T)\s*(?=\d)/g, "").split(/[\s/,|()-]+/).filter(Boolean);
  const row = WOMEN_SIZES.find(([, fr]) => tokens.includes(fr)) ?? WOMEN_SIZES.find(([letter]) => tokens.includes(letter));
  return row ? row.join(" / ") : s;
}

// Brands as vinted.fr spells them, keyed by what labels often say. Extend as needed.
const BRAND_ALIASES: Record<string, string[]> = {
  "Levi's": ["levis", "levi strauss", "levi strauss & co", "levi's strauss"],
  "H&M": ["h & m", "h and m", "hm", "h&m divided"],
  Zara: ["zara woman", "zara basic", "zara trf", "trf", "zara man"],
  Mango: ["mng", "mango suit", "mango casual"],
  "Pull & Bear": ["pull and bear", "pull&bear", "pullbear"],
  Bershka: [],
  "Stradivarius": [],
  "Massimo Dutti": [],
  Uniqlo: [],
  Kiabi: [],
  Jennyfer: [],
  Pimkie: [],
  Promod: [],
  Camaïeu: ["camaieu"],
  "Cache Cache": ["cache-cache"],
  Bonobo: [],
  Celio: ["celio*", "celio club"],
  Jules: [],
  "Monoprix": [],
  "C&A": ["c & a", "c and a"],
  Primark: ["primark denim co"],
  Shein: [],
  Asos: ["asos design"],
  "& Other Stories": ["other stories", "and other stories"],
  COS: [],
  Sézane: ["sezane"],
  Sandro: [],
  Maje: [],
  "Claudie Pierlot": [],
  "The Kooples": ["kooples"],
  "Comptoir des Cotonniers": [],
  "Des Petits Hauts": [],
  "Petit Bateau": [],
  "Armor Lux": ["armor-lux", "armorlux"],
  "Saint James": [],
  "Le Slip Français": ["le slip francais"],
  Lacoste: [],
  "Ralph Lauren": ["polo ralph lauren", "lauren ralph lauren", "polo by ralph lauren"],
  "Tommy Hilfiger": ["tommy", "hilfiger denim", "tommy jeans"],
  "Calvin Klein": ["calvin klein jeans", "ck"],
  "Hugo Boss": ["boss hugo boss"],
  Gant: [],
  "Superdry": ["superdry."],
  Diesel: [],
  "G-Star": ["g-star raw", "gstar", "g star raw"],
  "Jack & Jones": ["jack and jones", "jack&jones"],
  Only: [],
  "Vero Moda": [],
  "Object": [],
  "Selected": ["selected homme", "selected femme"],
  Esprit: ["edc", "edc by esprit"],
  Benetton: ["united colors of benetton"],
  "Nike": [],
  Adidas: ["adidas originals", "adidas performance"],
  Puma: [],
  "New Balance": [],
  Reebok: [],
  Converse: [],
  Vans: [],
  "Le Coq Sportif": [],
  Asics: [],
  "The North Face": ["north face", "tnf"],
  Patagonia: [],
  Columbia: ["columbia sportswear", "columbia sportswear company"],
  Quechua: ["decathlon quechua"],
  Kalenji: [],
  Decathlon: [],
  "Carhartt": ["carhartt wip"],
  "Dr. Martens": ["dr martens", "doc martens", "airwair"],
  Timberland: [],
  Birkenstock: [],
  Veja: [],
  "Faguo": [],
  "Napapijri": [],
  "Fred Perry": [],
  Lee: [],
  Wrangler: [],
  "Abercrombie & Fitch": ["abercrombie", "abercrombie and fitch"],
  "Hollister": [],
  "Gap": [],
  "Banana Republic": [],
  "Ba&sh": ["bash", "ba & sh", "ba&sh paris"],
  "IKKS": [],
  "Naf Naf": ["nafnaf"],
  "Morgan": ["morgan de toi"],
  "Etam": [],
  "Desigual": [],
  "Vila": ["vila clothes"],
  "Springfield": [],
  "Gémo": ["gemo"],
  "Tape à l'œil": ["tape a l'oeil", "tao"],
  "Okaïdi": ["okaidi"],
  "Vertbaudet": [],
  "Jacadi": [],
  "Cyrillus": [],
  "Bonpoint": [],
  "In Extenso": [],
};

const BRAND_INDEX = new Map<string, string>();
for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
  for (const a of [brand, ...aliases]) BRAND_INDEX.set(norm(a), brand);
}

export const isCategoryLeaf = (path: string) => BY_NORM.get(norm(path)) === path;

export const KNOWN_BRANDS = Object.keys(BRAND_ALIASES);

// "LEVI STRAUSS & CO" -> "Levi's". Unknown brands keep their label spelling.
export function vintedBrand(brand: string): string {
  const b = String(brand || "").trim();
  return BRAND_INDEX.get(norm(b)) ?? b;
}
