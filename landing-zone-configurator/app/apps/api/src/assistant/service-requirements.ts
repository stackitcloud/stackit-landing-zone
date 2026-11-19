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
    const answer = (
      statement.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ?? statement
    )
      .replace(/`[^`]*`/g, " ")
      .replace(/\b(ca|approx)\.(?=\s*\d)/gi, "$1");
    for (const sentence of answer.split(/(?<=[.!?\n])/)) {
      if (/[?]|["“”„]/.test(sentence)) continue;
      const approximate =
        "(?:(?:round about|about|around|roughly|approximately|approx|rund|etwa|ungefähr|circa|ca)\\s+|[~≈]\\s*)?";
      const users =
        "([1-9]\\d{0,5})\\s+(?:users?|developers?|Nutzer(?:n)?|Entwickler(?:n)?)\\b";
      const standalone = sentence.matchAll(
        new RegExp(`^\\s*${approximate}${users}[.!]?\\s*$`, "gi"),
      );
      const matches = sentence.matchAll(
        /(?:\bfor\s+(?:(?:all|our|the)\s+)*|\bfür\s+(?:(?:alle|unsere|die)\s+)*|\b(?:limit|reduce)\b[^.!?\n]{0,70}?\bto\s+|\b(?:begrenz\w*|reduzier\w*)\b[^.!?\n]{0,70}?\bauf\s+)(?:(?:round about|about|around|roughly|approximately|approx|rund|etwa|ungefähr|circa|ca)\s+|[~≈]\s*)?([1-9]\d{0,5})\s+(?:users?|developers?|Nutzer(?:n)?|Entwickler(?:n)?)\b/gi,
      );
      const suffixMatches = sentence.matchAll(
        /\bauf\s+([1-9]\d{0,5})\s+(?:Nutzer(?:n)?|Entwickler(?:n)?)\s+(?:begrenzen|reduzieren)\b/gi,
      );
      for (const match of [...matches, ...suffixMatches, ...standalone].sort(
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

/** Choose the smallest offered plan whose reviewed user ceiling fits. Unknown
 * offerings have no inferred capacity; unavailable plans are never selected.
 */
export function smallestReviewedUserPlan(
  field: keyof typeof reviewedUserLimits,
  available: readonly string[],
  requiredUsers: number,
): string | undefined {
  if (!Number.isSafeInteger(requiredUsers) || requiredUsers < 1)
    return undefined;
  return Object.entries(reviewedUserLimits[field])
    .filter(
      ([plan, ceiling]) => available.includes(plan) && ceiling >= requiredUsers,
    )
    .sort((a, b) => a[1] - b[1])[0]?.[0];
}
