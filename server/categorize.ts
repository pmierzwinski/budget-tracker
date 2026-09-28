export const DEFAULT_CATEGORY = "Inne";

export const BUILTIN_CATEGORIES = [
  "Spożywcze",
  "Jedzenie na mieście",
  "Paliwo",
  "Transport",
  "Rachunki",
  "Mieszkanie",
  "Zdrowie",
  "Odzież",
  "Rozrywka",
  "Subskrypcje",
  "Inwestycje",
  "Finanse",
  "Przelewy",
  "Wynagrodzenie",
  "Inne",
] as const;

export const LEGACY_SKIP_CATEGORY = "Poza statystykami";

export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

const RULES: { category: BuiltinCategory; patterns: RegExp[] }[] = [
  {
    category: "Wynagrodzenie",
    patterns: [/wynagrodzen/i, /pensja/i, /salary/i],
  },
  {
    category: "Spożywcze",
    patterns: [
      /biedronka/i,
      /lidl/i,
      /[żz]abka/i,
      /auchan/i,
      /carrefour/i,
      /kaufland/i,
      /netto/i,
      /\bdino\b/i,
      /lewiatan/i,
      /stokrotka/i,
      /intermarche/i,
      /\baldi\b/i,
      /groszek/i,
      /delikatesy/i,
      /spichlerz/i,
    ],
  },
  {
    category: "Paliwo",
    patterns: [/orlen/i, /\bbp\b/i, /shell/i, /circle\s*k/i, /lotos/i, /\bmoya\b/i, /amoc/i, /myjnia/i, /paliwo/i, /stacja paliw/i],
  },
  {
    category: "Transport",
    patterns: [
      /\buber\b/i,
      /\bbolt\b/i,
      /jakdojade/i,
      /\bpkp\b/i,
      /koleo/i,
      /poci[aą]g/i,
      /\bmpk\b/i,
      /\bztm\b/i,
      /parking/i,
      /bilety/i,
      /koleje/i,
    ],
  },
  {
    category: "Jedzenie na mieście",
    patterns: [
      /mcdonald/i,
      /\bkfc\b/i,
      /burger/i,
      /starbucks/i,
      /pizza/i,
      /restaurac/i,
      /kebab/i,
      /sushi/i,
      /pyszne/i,
      /\bglovo\b/i,
      /uber\s*eats/i,
      /\bwolt\b/i,
      /kawiarn/i,
    ],
  },
  {
    category: "Subskrypcje",
    patterns: [
      /netflix/i,
      /spotify/i,
      /youtube/i,
      /disney/i,
      /\bhbo\b/i,
      /apple\.com/i,
      /amazon prime/i,
      /google\s?\*?payment/i,
      /microsoft/i,
      /openai/i,
      /chatgpt/i,
      /\bcursor\b/i,
      /playstation/i,
    ],
  },
  {
    category: "Inwestycje",
    patterns: [/\bxtb\b/i, /etoro/i, /trading\s*212/i, /xtb\.com/i],
  },
  {
    category: "Rachunki",
    patterns: [
      /\bpge\b/i,
      /tauron/i,
      /enea/i,
      /energa/i,
      /veolia/i,
      /mpwik/i,
      /pgnig/i,
      /innogy/i,
      /orange/i,
      /\bplay\b/i,
      /t-?mobile/i,
      /\bupc\b/i,
      /vectra/i,
      /netia/i,
      /abonament/i,
    ],
  },
  {
    category: "Zdrowie",
    patterns: [
      /apteka/i,
      /luxmed/i,
      /medicover/i,
      /\bnfz\b/i,
      /lekarz/i,
      /dentyst/i,
      /przychodn/i,
      /doz\.pl/i,
      /calma?med/i,
    ],
  },
  {
    category: "Mieszkanie",
    patterns: [
      /czynsz/i,
      /sp[oó]łdziel/i,
      /administrac/i,
      /\bikea\b/i,
      /castorama/i,
      /leroy/i,
      /\bobi\b/i,
      /media expert/i,
      /media markt/i,
      /rtv euro/i,
    ],
  },
  {
    category: "Odzież",
    patterns: [/reserved/i, /h&m|\bhm\b/i, /\bzara\b/i, /\bccc\b/i, /deichmann/i, /cropp/i, /\bhouse\b/i, /sinsay/i],
  },
  {
    category: "Rozrywka",
    patterns: [/helios/i, /multikino/i, /cinema/i, /\bsteam\b/i, /\bxbox\b/i, /empik/i, /allegro/i],
  },
  {
    category: "Finanse",
    patterns: [/prowizja/i, /oprocentowan/i, /odsetki/i, /op[łl]ata/i, /kapitalizac/i, /infakt/i],
  },
];

export type CategoryRule = { pattern: string; category: string };

export function categorizeBuiltin(text: string, amount: number): string {
  const haystack = text.replace(/\s+/g, " ");
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) return rule.category;
  }
  if (/przelew|blik/i.test(haystack)) return "Przelewy";
  if (amount > 0) return "Przelewy";
  return DEFAULT_CATEGORY;
}

export function categorizeWithUserRules(
  text: string,
  amount: number,
  rules: CategoryRule[],
  blocked?: Iterable<string>,
): string {
  const haystack = text.replace(/\s+/g, " ").toLowerCase();
  let next = DEFAULT_CATEGORY;
  let matched = false;
  for (const rule of rules) {
    const needle = rule.pattern.trim().toLowerCase();
    if (needle && haystack.includes(needle)) {
      next = rule.category;
      matched = true;
      break;
    }
  }
  if (!matched) next = categorizeBuiltin(text, amount);
  if (blocked && new Set(blocked).has(next)) return DEFAULT_CATEGORY;
  return next;
}

export function searchText(tx: {
  payee: string;
  title: string;
  description: string;
  type: string;
}): string {
  return [tx.payee, tx.title, tx.description, tx.type].filter(Boolean).join(" ");
}

export function suggestPattern(text: string): string {
  const cleaned = text
    .replace(/^www\./i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  const token = cleaned.split(/[\s,/|]+/).find((part) => part.replace(/[.\d]/g, "").length >= 3);
  return (token || cleaned).slice(0, 40);
}
