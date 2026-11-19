/** BM25 over the selected, curated source bundle only. No remote ingestion,
 * customer configuration, model intent classes or product-specific routing. */
const stop = new Set(
  "a an and answer are as at be been being by can could do does for from has have how i if in is it its me my not of on or our please should so that the their then there these they this to use uses using was we were what when where which who why will with would you your only explain advice changes execution stackit accelerator configurator".split(
    " ",
  ),
);
function words(text: string) {
  return (
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu) ?? []
  )
    .filter((word) => !stop.has(word) && !/^\d+$/.test(word))
    .map((word) =>
      word.length > 4 && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word,
    );
}
export function searchAssistantKnowledge(
  sources: readonly { id: string; text: string }[],
  query: string,
) {
  const terms = [...new Set(words(query))].slice(0, 80);
  if (terms.length < 2) return [];
  const documents = sources.map((source) => {
    const tokens = words(source.text),
      counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { ...source, length: tokens.length, counts };
  });
  const average =
    documents.reduce((sum, doc) => sum + doc.length, 0) /
    Math.max(1, documents.length);
  const frequency = new Map(
    terms.map((term) => [
      term,
      documents.filter((doc) => doc.counts.has(term)).length,
    ]),
  );
  const results = documents
    .map((doc) => {
      let score = 0,
        matched = 0;
      for (const term of terms) {
        const count = doc.counts.get(term) ?? 0;
        if (!count) continue;
        matched++;
        const seen = frequency.get(term) ?? 0;
        const rarity = Math.log(
          1 + (documents.length - seen + 0.5) / (seen + 0.5),
        );
        score +=
          (rarity * (count * 2.2)) /
          (count + 1.2 * (0.25 + (0.75 * doc.length) / Math.max(1, average)));
      }
      return { id: doc.id, score, matched };
    })
    .filter((result) => result.matched >= 2 && result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return results
    .filter((result) => result.score >= (results[0]?.score ?? 0) * 0.55)
    .slice(0, 2);
}
