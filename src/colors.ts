// Category colors (keep them apart from the semantic tokens in index.css).
export const CATEGORY_COLORS: Record<string, string> = {
  Spożywcze: "#2F6F4E",
  "Jedzenie na mieście": "#C45C4A",
  Paliwo: "#C47A12",
  Transport: "#3D6EA8",
  Rachunki: "#6B5B95",
  Mieszkanie: "#8B6914",
  Zdrowie: "#3F8C7A",
  Odzież: "#A45D7A",
  Rozrywka: "#4A7C59",
  Subskrypcje: "#2C5F7C",
  Inwestycje: "#1F4E79",
  Finanse: "#5C6370",
  Przelewy: "#7A6A4F",
  Wynagrodzenie: "#1F7A4D",
  Inne: "#8A8175",
};

const FALLBACK = ["#8A5A44", "#4F6D7A", "#6B4E71", "#3E5C41", "#9A6B2F", "#5A4E3B"];

/** Built-in categories have fixed colors; new names get one from a hash of the name. */
export function categoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}
