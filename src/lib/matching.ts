// Matching the codes projects go by – "2-34646.00  E2627", "NZL-WSP-2-34646.00", "NZ0076233.6289" – to a project.

import type { Project } from '../db/types';

/** A code without its prefix, spaces or case: the part that stays the same wherever it is written. */
export function normaliseCode(code: string | undefined): string {
  return (code ?? '')
    .trim()
    .toLowerCase()
    .replace(/^nzl-wsp-/, '')
    .replace(/\s+/g, ' ');
}

/** The first code in a cell: "2-34646.00  E2627" → "2-34646.00"; "2-34645.03 / TBC" → "2-34645.03". */
export function firstCode(code: string | undefined): string {
  return normaliseCode(code).split(/[\s/]+/)[0] ?? '';
}

/** The task code after the project code, if any ("2-34646.00  E2627" → "E2627"). */
export function taskCode(code: string | undefined): string | undefined {
  const parts = normaliseCode(code).split(/\s+/);
  return parts.length > 1 && /^[a-z]?\d{3,5}[a-z]*$/i.test(parts[1]) ? parts[1].toUpperCase() : undefined;
}

/** The project a code belongs to, by its number or an alias (the same code, however the prefix is written). */
export function matchProject(code: string | undefined, projects: Project[]): Project | undefined {
  const c = firstCode(code);
  if (!c) return undefined;
  const key = (s: string) => normaliseCode(s);
  // exact, then an alias, then the code without its last ".xx" part on either side
  let hit = projects.find((p) => key(p.id) === c || p.aliases.some((a) => firstCode(a) === c));
  if (hit) return hit;
  const stem = c.replace(/\.\d+[a-z]*$/, '');
  hit = projects.find((p) => key(p.id).replace(/\.\d+[a-z]*$/, '') === stem);
  return hit;
}
