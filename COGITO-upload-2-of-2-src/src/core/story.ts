import { normalize } from './text';

// Story recall uses a predefined idea-unit rubric (in the spirit of Logical Memory-style scoring).
// Each unit lists keyword groups; the automatic pass credits a unit only when every group is matched.
// The automatic pass is a *suggestion*: the user then reviews each unit against the rubric and can
// override it, so scoring never relies on keyword matching alone.

export interface StoryUnit {
  id: string;
  /** Rubric text shown during review. */
  text: string;
  main: boolean;
  /** All groups must match; a group matches if any stem matches (token prefix, or phrase substring). */
  keys: string[][];
}

export interface Story {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  text: string;
  units: StoryUnit[];
  /** Key events in true chronological order (used for the temporal-order test). */
  events: string[];
  /** Every number that appears in the story, as digits. */
  numbers: string[];
}

function groupMatches(tokens: string[], joined: string, group: string[]): boolean {
  return group.some((raw) => {
    const stem = normalize(raw);
    if (!stem) return false;
    if (stem.includes(' ')) return joined.includes(stem);
    return tokens.some((t) => t.startsWith(stem));
  });
}

export function autoCreditUnits(story: Story, response: string): Record<string, boolean> {
  const joined = ` ${normalize(response)} `;
  const tokens = joined.trim().split(' ').filter(Boolean);
  const out: Record<string, boolean> = {};
  for (const u of story.units) out[u.id] = u.keys.every((g) => groupMatches(tokens, joined, g));
  return out;
}

/** Numbers in the response that never appear in the story: an objective intrusion signal. */
export function numberIntrusions(story: Story, response: string): string[] {
  const found = response.match(/\d+/g) ?? [];
  const allowed = new Set(story.numbers);
  return [...new Set(found.filter((n) => !allowed.has(n)))];
}

export function summarizeStory(story: Story, credits: Record<string, boolean>, intrusions: number) {
  const main = story.units.filter((u) => u.main);
  const details = story.units.filter((u) => !u.main);
  const mainOk = main.filter((u) => credits[u.id]).length;
  const detailOk = details.filter((u) => credits[u.id]).length;
  const total = mainOk + detailOk;
  return {
    units: story.units.length,
    unitsRecalled: total,
    mainIdeas: mainOk,
    mainTotal: main.length,
    details: detailOk,
    detailTotal: details.length,
    omissions: story.units.length - total,
    intrusions,
    accuracy: story.units.length ? total / story.units.length : 0,
  };
}
