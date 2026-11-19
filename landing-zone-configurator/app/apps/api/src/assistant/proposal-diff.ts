import { isDeepStrictEqual } from "node:util";

export type ProposalDelta = {
  path: string;
  before?: unknown;
  after?: unknown;
  added?: unknown[];
  removed?: unknown[];
  addedGroups?: Record<string, number>;
  removedGroups?: Record<string, number>;
};

/** Compare compiler-produced PUBLIC values. Unchanged identities and access
 * metadata never enter the review; permission order is not a change of rights. */
export function consultationProposalDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ProposalDelta[] {
  const result: ProposalDelta[] = [];
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const visit = (left: unknown, right: unknown, path: string) => {
    if (path.startsWith("assistant.") || isDeepStrictEqual(left, right)) return;
    if (Array.isArray(left) || Array.isArray(right)) {
      const prior = Array.isArray(left) ? left : [];
      const next = Array.isArray(right) ? right : [];
      const priorKeys = new Set(prior.map((value) => JSON.stringify(value)));
      const nextKeys = new Set(next.map((value) => JSON.stringify(value)));
      const added = next.filter(
        (value) => !priorKeys.has(JSON.stringify(value)),
      );
      const removed = prior.filter(
        (value) => !nextKeys.has(JSON.stringify(value)),
      );
      const permissionSet = /\.(permissions|automationPermissions)$/.test(path);
      if (permissionSet && !added.length && !removed.length) return;
      const groups = (values: unknown[]) =>
        values.reduce<Record<string, number>>((counts, value) => {
          if (typeof value === "string") {
            const product = value.split(".")[0]!;
            counts[product] = (counts[product] ?? 0) + 1;
          }
          return counts;
        }, {});
      result.push(
        permissionSet
          ? {
              path,
              added,
              removed,
              addedGroups: groups(added),
              removedGroups: groups(removed),
            }
          : { path, before: left, after: right, added, removed },
      );
      return;
    }
    if (Object.keys(object(left)).length || Object.keys(object(right)).length) {
      const previous = object(left),
        next = object(right);
      for (const key of new Set([
        ...Object.keys(previous),
        ...Object.keys(next),
      ]))
        visit(previous[key], next[key], path ? `${path}.${key}` : key);
    } else result.push({ path, before: left, after: right });
  };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const root = key.split(".")[0]!;
    if (
      key.includes(".") &&
      (Object.hasOwn(before, root) || Object.hasOwn(after, root))
    )
      continue;
    visit(before[key], after[key], key);
  }
  return result;
}
