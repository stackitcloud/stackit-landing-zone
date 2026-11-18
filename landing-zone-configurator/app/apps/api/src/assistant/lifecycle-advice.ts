import type { AssistantLanguage } from "@lzc/contracts";
import { assistantApplicationUpgradeAdvice } from "./knowledge.js";

type LifecycleTask = keyof typeof assistantApplicationUpgradeAdvice;

/** A clear current question about the application's named root Plan review
 * workflow needs no resource-topic guess. Quoted values and reply headers are
 * not a new workflow request. This supplies guidance, never approval.
 */
export function explicitRootPlanReviewQuestion(message: string): boolean {
  const answer =
    message.split(/(?:My answer|Meine Antwort)\s*:\s*/i).at(-1) ?? message;
  const text = answer.replace(/`[^`]*`|"(?:\\.|[^"\\])*"/g, " ");
  return (
    /\b(?:root\s+(?:platform\s+)?plan|platform[-\s]*plan|plattform[-\s]*plan)\b/i.test(
      text,
    ) &&
    /\b(?:review|approv|acknowledg|confirm|freigab|bestätig|pr[üu]f|gebunden|binding|unblock|entsperr|genehmig)/i.test(
      text,
    ) &&
    /\?|\b(?:how|why|when|which|whether|explain|wie|wann|woran|warum|welch\w*|erklär\w*|erklaer\w*)\b/i.test(
      text,
    )
  );
}

const englishLifecycleAdvice: Record<LifecycleTask, string> = {
  "template-upgrade":
    "1. The Platform Owner publishes a new version of the same template family and an upgrade path from the old version. Publication alone changes no order. In the same order, open Updates and review the target and comparison; do not create a replacement order.\n\n" +
    "2. Retain parameter answers and supply new required inputs. Changed answers or targets need a fresh preview. Explicitly confirm the desired binding: the original publication, order, project identity, State key and backend remain. This starts neither Plan nor Apply and changes no infrastructure.\n\n" +
    "3. Create and review a fresh Plan against actual State. Deletion/replacement of existing infrastructure remains blocked, including services, accounts and credentials; unknown/incomplete evidence also blocks. No checkbox bypasses these guards. Only project roles and assignments can be removed/replaced as sensitive IAM changes in the exact Plan. Organization, placement, network-area or backend migration needs a separate reviewed procedure.\n\n" +
    "4. The published upgrade-path policy is independent of both versions' ordering policies. Self-service lets the Application Owner review the fresh Plan and approve Apply without an extra Platform Owner approval. Separate Plan approval binds the exact Plan, artifact hash and upgrade snapshot, including ordinary changes. Apply still needs explicit confirmation. Policy changes are new immutable publications: old targets/Plans retain their policy. Withdraw an unapplied target, select the new path and plan again.\n\n" +
    "Active/unresolved jobs, active Runner grants and open recovery block binding changes. Failed Apply can already change State/resources; desired binding remains. Recovery uses the frozen interrupted job, not the last successful Apply. Re-plan afterwards. I have not inspected this order. Guidance only: nothing has been saved or executed; chat publishes, binds, approves and unblocks nothing.",
  "platform-upgrade":
    "Platform Apply immediately changes shared firewall/routing for dependent Applications. Declining an order's contract binding does not preserve an old firewall.\n\n" +
    "1. Before Platform Apply, review the dependency/impact assessment and native Plan. The Platform Owner decides deletions/replacements using resource changes, counts, affected Applications and possible data loss. Unknown/incomplete evidence, active execution and open recovery remain blockers.\n\n" +
    "2. Explicit impact confirmation binds the exact Plan, artifact hash, State version and dependency set, including destructive changes. Changed State/dependencies invalidate it. Approve Platform Apply separately afterwards.\n\n" +
    "3. After successful Apply, release the actual resulting unlocked platform contract. The Platform Owner publishes an explicit upgrade path between real reviewed contracts; no automatic order binding occurs.\n\n" +
    "4. The Application Owner reviews Updates and explicitly selects the target binding. Template version, order, project identity, parameters, State key and backend remain, as does the immutable original publication. Binding starts neither Plan nor Apply; unresolved jobs, recovery and active grants block it. Review a fresh Application Plan against actual State. Its published path policy is independent of ordering policy: self-service needs no extra Platform Owner approval; otherwise the exact Plan needs approval even for ordinary changes. Confirm Apply separately. Existing infrastructure deletion/replacement and unknown evidence remain blocked; only project roles/assignments may be removed/replaced as sensitive IAM changes. A new path policy needs new selection and a fresh Plan; old targets/Plans stay bound.\n\n" +
    "Organization/project placement, network-area and backend migrations are separate. Failed partial Apply may change State; desired binding remains. Recovery uses the frozen interrupted job. I have not inspected this order. Guidance only: nothing has been saved or executed; chat publishes, binds, approves and unblocks nothing.",
  "platform-impact-review":
    "1. As Platform Owner, review a fresh, complete root platform Plan: resource changes and create/update/replace/delete counts, plus affected Application Landing Zones. Known deletions/replacements are the Platform Owner's decision; data loss and outages are possible. The server checks authoritative permissions.\n\n" +
    "2. In Apply, confirm the impacts of that saved Plan. Confirmation binds the exact Plan, artifact hash, State version and current dependencies. A different Plan, changed State or dependencies invalidates it. Old blocked Plans are not unblocked retrospectively: create a new Plan. Resolve unknown/incomplete evidence, active Application executions and open recovery first.\n\n" +
    "3. Impact confirmation does not start Apply. Afterwards approve Apply separately, including organization confirmation and destructive-change approval. For Audit migration from Logs to Observability, also review loss of old Logs history and preservation of Router, links and S3 archive in the Plan.\n\n" +
    "This review is not a template upgrade and changes no order. I have not inspected your saved Plan. Guidance only: nothing has been saved or executed; chat cannot approve or unblock Apply.",
  "execution-source-upgrade":
    "Keep the existing Application order and its State binding; do not create a replacement order. A product update does not automatically change its bound Accelerator source. Only reviewed bundled sources run with the patched worker, not arbitrary Git revisions. Check actual availability and open jobs in order details under Updates → Execution state; I have not inspected this order.\n\n" +
    "Origin is the immutable Git revision of the template publication. Desired is the selected Accelerator execution revision. LastApplied is the source of the last successful Apply, not a complete account of current State and not the recovery source.\n\n" +
    "Select the offered reviewed replacement for the same order and explicitly confirm the update. This changes only desired execution binding: project, State, backend and template rules remain. It starts neither Plan nor Apply. Create a new Plan against actual State, review changes/deletions/replacements, then grant the normal separate explicit Apply approval. Do not reuse an old Plan.\n\n" +
    "A failed Apply can already change State/resources; loss-free or unchanged State is not guaranteed. Desired remains selected. Recovery uses the interrupted job's source. Active/unresolved jobs, active grants and open recovery block upgrade until reconciliation.\n\n" +
    "Withdrawn sources cannot execute. Use the reviewed upgrade path for the same order. If a package is missing, an operator must provide a reviewed package or the offered replacement path. If recovery is open and its source is withdrawn, retain State and the hold; an operator must supply a reviewed compatible recovery package before upgrade can proceed. No guard bypass. Guidance only: nothing has been saved or executed; chat cannot upgrade, unblock, Plan or Apply.",
};

export function assistantLifecycleAdvice(
  task: LifecycleTask,
  language: AssistantLanguage,
): string {
  return language === "en"
    ? englishLifecycleAdvice[task]
    : assistantApplicationUpgradeAdvice[task];
}
