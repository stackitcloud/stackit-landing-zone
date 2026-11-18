import type { CloudCatalogueField } from "@lzc/contracts";

/** Reviewed hard limits, independent of live offering availability. */
export const reviewedUserLimits = {
  gitFlavors: { "git-10": 10, "git-100": 100 },
} satisfies Partial<Record<CloudCatalogueField, Record<string, number>>>;

/** Read literal affirmative workload counts from an active setup's USER answers.
 * Numbers in offered options, questions, quoted history or plan names are not
 * workload evidence. Later explicit scope statements replace earlier counts.
 */
export function confirmedServiceUserCount(
  statements: string[],
): number | undefined {
  let count: number | undefined;
  for (const statement of statements) {
    const answer =
      statement.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ??
      statement;
    for (const sentence of answer.split(/(?<=[.!?\n])/)) {
      if (/[?]|["“”„]/.test(sentence)) continue;
      const matches = sentence.matchAll(
        /(?:\bfor\s+(?:(?:all|our|the)\s+)*|\bfür\s+(?:(?:alle|unsere|die)\s+)*|\b(?:limit|reduce)\b[^.!?\n]{0,70}?\bto\s+|\b(?:begrenz\w*|reduzier\w*)\b[^.!?\n]{0,70}?\bauf\s+)([1-9]\d{0,5})\s+(?:users?|developers?|Nutzer(?:n)?|Entwickler(?:n)?)\b/gi,
      );
      const suffixMatches = sentence.matchAll(
        /\bauf\s+([1-9]\d{0,5})\s+(?:Nutzer(?:n)?|Entwickler(?:n)?)\s+(?:begrenzen|reduzieren)\b/gi,
      );
      for (const match of [...matches, ...suffixMatches].sort(
        (a, b) => a.index - b.index,
      )) {
        const prefix = sentence.slice(0, match.index);
        if (/\b(?:not|never|nicht|kein\w*)\s*$/i.test(prefix)) continue;
        count = Number(match[1]);
      }
    }
  }
  return count;
}
