import { t } from "../i18n";

export type MemberRole = "platform-engineer" | "application-owner";
export type WorkspaceMember = {
  userId: string;
  login: string | null;
  displayName?: string | null;
  email?: string | null;
  roles: MemberRole[];
  manageMembers: boolean;
};
export function memberName(
  member: Pick<WorkspaceMember, "userId" | "login" | "displayName" | "email">,
) {
  if (member.displayName?.trim()) return member.displayName;
  if (member.email) return member.email;
  if (member.login)
    return member.login.includes("@") ? member.login : `@${member.login}`;
  return t("Mitglied {{value0}}", { value0: member.userId.slice(0, 8) });
}
