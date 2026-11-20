import { isDeepStrictEqual } from "node:util";
import { type JsonValue, objectValue } from "@lzc/domain";

type MaterializedChange = {
  path: string;
  operation: "merge" | "replace" | "default";
  value: JsonValue;
};

export type ProposedNativeDefault = {
  path: string;
  value: JsonValue;
  source: string;
  origin: "proposal-default";
};

/** Defaults are source provenance for a reviewable proposal, never a user
 * decision. Only omitted creation fields are filled; explicit null/false/[]
 * and existing component values retain their own semantics. */
export function materializeNativeDefaultProposals(
  input: readonly MaterializedChange[],
  current: Record<string, unknown>,
  policies: Record<string, { creationDecisions?: readonly string[] }>,
  read: (path: string) => { found: boolean; value: JsonValue; source: string },
  allowed: (path: string) => boolean,
) {
  const changes = structuredClone(input) as MaterializedChange[];
  const defaults = new Map<string, ProposedNativeDefault>();
  const record = (path: string, value: JsonValue, reset = false) => {
    if (!allowed(path)) return;
    const native = read(path);
    if (native.found && (reset || isDeepStrictEqual(value, native.value)))
      defaults.set(path, {
        path,
        value: native.value,
        source: native.source,
        origin: "proposal-default",
      });
  };
  for (const change of changes) {
    const root = change.path.split(".")[0]!;
    if (
      current[root] == null &&
      change.path === root &&
      change.value &&
      typeof change.value === "object" &&
      !Array.isArray(change.value)
    ) {
      for (const path of policies[root]?.creationDecisions ?? []) {
        if (!allowed(path)) continue;
        const native = read(path);
        if (!native.found || native.value === null) continue;
        const keys = path.split(".").slice(1);
        let target = objectValue(change.value);
        let missingParent = false;
        for (const key of keys.slice(0, -1)) {
          if (target[key] === undefined) target[key] = {};
          if (
            !target[key] ||
            typeof target[key] !== "object" ||
            Array.isArray(target[key])
          ) {
            missingParent = true;
            break;
          }
          target = objectValue(target[key]);
        }
        const key = keys.at(-1);
        if (!missingParent && key && target[key] === undefined) {
          target[key] = structuredClone(native.value);
        }
      }
    }
    const visit = (value: JsonValue, path: string) => {
      if (value && typeof value === "object" && !Array.isArray(value))
        for (const [key, child] of Object.entries(value))
          visit(child, `${path}.${key}`);
      else record(path, value);
    };
    if (change.operation === "default") record(change.path, change.value, true);
    else visit(change.value, change.path);
  }
  return { changes, defaults: [...defaults.values()] };
}
