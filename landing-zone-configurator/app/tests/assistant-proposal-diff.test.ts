import { expect, it } from "vitest";
import { consultationProposalDiff } from "../apps/api/src/assistant/proposal-diff.js";

it("exposes removed rights and newly added product groups separately for each principal", () => {
  const before = {
    projectTemplates: {
      central: {
        accessProfile: {
          permissions: ["iaas.server.get", "ske.cluster.create"],
          automationPermissions: ["iaas.server.get"],
        },
      },
    },
  };
  const after = {
    projectTemplates: {
      central: {
        accessProfile: {
          permissions: [
            "iaas.server.get",
            "argus.instance.create",
            "server-backup.backup.create",
          ],
          automationPermissions: [
            "iaas.server.get",
            "server-backup.backup.create",
          ],
        },
      },
    },
  };
  expect(consultationProposalDiff(before, after)).toEqual([
    {
      path: "projectTemplates.central.accessProfile.permissions",
      added: ["argus.instance.create", "server-backup.backup.create"],
      removed: ["ske.cluster.create"],
      addedGroups: { argus: 1, "server-backup": 1 },
      removedGroups: { ske: 1 },
    },
    {
      path: "projectTemplates.central.accessProfile.automationPermissions",
      added: ["server-backup.backup.create"],
      removed: [],
      addedGroups: { "server-backup": 1 },
      removedGroups: {},
    },
  ]);
});
it("omits unchanged identity and IAM metadata, virtual aliases and harmless permission ordering", () => {
  const before = {
    rm_folders: {
      platform: { name: "Platform", owner_emails: ["private@example.invalid"] },
    },
    devops: { git_flavor: "git-100" },
    "assistant.user_email": "private-login@example.invalid",
    "devops.git_flavor": "git-100",
    projectTemplates: {
      central: {
        accessProfile: { permissions: ["iaas.server.get", "ske.cluster.get"] },
      },
    },
  };
  const after = structuredClone(before);
  after.rm_folders.platform.name = "New Platform";
  after.projectTemplates.central.accessProfile.permissions.reverse();
  const delta = consultationProposalDiff(before, after);
  expect(delta).toEqual([
    {
      path: "rm_folders.platform.name",
      before: "Platform",
      after: "New Platform",
    },
  ]);
  expect(JSON.stringify(delta)).not.toContain("private");
});
it("retains meaningful ordering changes for ordinary native arrays", () => {
  expect(
    consultationProposalDiff(
      { nameservers: ["1.1.1.1", "8.8.8.8"] },
      { nameservers: ["8.8.8.8", "1.1.1.1"] },
    ),
  ).toEqual([
    {
      path: "nameservers",
      before: ["1.1.1.1", "8.8.8.8"],
      after: ["8.8.8.8", "1.1.1.1"],
      added: [],
      removed: [],
    },
  ]);
});
