/**
 * Filtro de groserías para textos que ven otros usuarios (reseñas). Lista
 * pensada para el español de Colombia + lo más común en inglés.
 *
 * Normaliza antes de comparar: minúsculas, sin tildes, "leet" (put4 → puta,
 * h1jue → hijue), letras repetidas (puuuuta → puta). Compara palabra por
 * palabra (sin falsos positivos tipo "computadora" ⊃ "puta") y, para las
 * raíces largas e inequívocas, también el texto pegado sin espacios ni
 * signos (atrapa "h.i.j.u.e.p.u.t.a" o "gono rrea").
 */

/** Palabras exactas (singular; los plurales en -s/-es se prueban solos). */
const WORDS = [
  'hp', 'hpta', 'hpt', 'hijueputa', 'hijoeputa', 'hijodeputa', 'jueputa', 'juepucha',
  'gonorrea', 'malparido', 'malparida', 'marica', 'maricon', 'maricona',
  'puta', 'puto', 'putica', 'putazo', 'perra', 'zorra', 'mierda', 'mierdero',
  'culo', 'culero', 'culicagado', 'verga', 'careverga', 'carechimba',
  'pendejo', 'pendeja', 'idiota', 'imbecil', 'estupido', 'estupida', 'tarado',
  'tarada', 'cabron', 'cabrona', 'malnacido', 'malnacida', 'mamaguevo',
  'mamahuevo', 'mamaverga', 'guevon', 'huevon', 'guevona', 'huevona', 'gueva',
  'piroba', 'pirobo', 'coño', 'joder', 'jodido', 'jodida', 'carajo', 'lambon',
  'sapohijueputa', 'cagada', 'cagado', 'pichurria', 'triplehijueputa', 'malpa',
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'asshole', 'dick', 'cunt',
  'motherfucker', 'bastard',
];

/** Raíces largas que se buscan también dentro del texto pegado. */
const STEMS = [
  'hijueput', 'hijoeput', 'hijodeput', 'jueput', 'gonorre', 'malparid',
  'mamaguev', 'mamahuev', 'mamaverg', 'careverg', 'carechimb', 'malnacid',
  'motherfuck', 'fuck',
];

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's',
};

/** minúsculas, sin tildes (la ñ se conserva), leet → letras, sin repetidas. */
function normalize(text: string): string {
  return collapse(
    text
      .toLowerCase()
      .replace(/ñ/g, '\u0000')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\u0000/g, 'ñ')
      .replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch),
  );
}

/** "puuuuta" → "puta", "gonorrea" → "gonorea" (se aplica igual a la lista). */
function collapse(text: string): string {
  return text.replace(/(.)\1+/g, '$1');
}

const WORD_SET = new Set(WORDS.map((w) => collapse(w)));
const STEM_LIST = STEMS.map((s) => collapse(s));

export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = normalize(text);

  const tokens = normalized.split(/[^a-zñ]+/).filter(Boolean);
  for (const token of tokens) {
    if (WORD_SET.has(token)) return true;
    // Plurales: "putas", "gonorreas", "maricones".
    if (token.endsWith('es') && WORD_SET.has(token.slice(0, -2))) return true;
    if (token.endsWith('s') && WORD_SET.has(token.slice(0, -1))) return true;
    if (STEM_LIST.some((stem) => token.startsWith(stem))) return true;
  }

  // Letras separadas para esquivar el filtro ("h.p", "g o n o r r e a"):
  // tramos de tokens de UNA letra seguidos se juntan y se comparan.
  const glued = normalized.replace(/[^a-zñ]+/g, '');
  if (STEM_LIST.some((stem) => glued.includes(stem))) return true;
  let run = '';
  for (const token of [...tokens, '']) {
    if (token.length === 1) {
      run += token;
      continue;
    }
    if (run.length > 1 && WORD_SET.has(collapse(run))) return true;
    run = '';
  }
  return false;
}
