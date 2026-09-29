export function isApplicablePlan(manifest, contextHash, planHash, now = Date.now()) {
  if (!manifest || manifest.status !== "ready") return false;
  if (manifest.contextHash !== contextHash || manifest.planHash !== planHash) return false;
  const created = Date.parse(manifest.createdAt);
  return Number.isFinite(created) && created <= now && now - created <= 24 * 60 * 60 * 1000;
}
