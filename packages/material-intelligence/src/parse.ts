/**
 * ValueProof — Material Intelligence upload parser (§4.3 add-on)
 *
 * Turns a pasted/uploaded scope of work (plain text, CSV, or the guided
 * builder's form fields) into `MaterialLine[]`. Handles the common shapes:
 *
 *   Kitchen counters: Granite / quartz
 *   Flooring - Solid hardwood
 *   counters,Granite / quartz          (CSV)
 *   Granite countertops throughout     (bare line — category inferred later)
 *
 * PDF/XLSX uploads are converted to text upstream; when the Anthropic key is
 * configured a Claude pass can pre-clean messy documents into these shapes —
 * the parser itself stays deterministic.
 */

import type { MaterialLine } from './analyst.ts';

const SEPARATORS = [':', ' - ', '—', '\t', ','];

/** Parse free text / CSV into material lines. Empty and comment lines skipped. */
export function parseMaterialText(text: string): MaterialLine[] {
  const out: MaterialLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parsed = parseLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseLine(line: string): MaterialLine | null {
  // Strip list bullets ("- ", "* ", "1. ").
  const clean = line.replace(/^([-*•]|\d+[.)])\s+/, '').trim();
  if (!clean) return null;

  for (const sep of SEPARATORS) {
    const idx = clean.indexOf(sep);
    if (idx > 0 && idx < clean.length - sep.length) {
      const category = clean.slice(0, idx).trim();
      const material = clean.slice(idx + sep.length).trim();
      // Guard against sentences where ':' is prose, e.g. "Note: call the GC".
      if (material && category.length <= 40) return { category, material };
    }
  }
  // Bare material line — the analyst infers the category.
  return { material: clean };
}
