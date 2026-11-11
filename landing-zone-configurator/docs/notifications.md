# Notifications and transactional email

[English](notifications.md) | [Deutsch](notifications.de.md)

The bell in the header opens your inbox for the active workspace. Unread messages,
90-day history and links to the relevant order, execution or membership view are
available independently of email preferences. Opening a link does not approve or
start anything; current authentication, membership and workflow authorization
still apply. If a mail belongs to another workspace, switch explicitly using the
workspace notice. The destination checks membership again.

Under **Notifications → Email notifications**, each user chooses topics and the
message language (German by default, or English). Preferences belong to the user,
across workspaces and app instances. There is no workspace-level topic switch.
Approvals, failures, recovery, access changes and bounded reminders default on;
successful execution emails default off. These choices affect email only. An
operator can disable the instance's email integration without hiding the inbox.

| Event | Audience | Email topic |
| --- | --- | --- |
| Invitation explicitly emailed by the inviter | The specified invited address | Inviter-controlled; independent of personal preferences |
| New order requiring approval | Current Platform Engineers except the requester | Orders and approvals |
| Order approved or rejected | Requester | Orders and approvals |
| Reviewed upgrade approved | Order owner | Orders and approvals |
| Platform Plan/Apply finished or needs recovery | Execution owner | Success / failure / recovery |
| Application Plan/Apply finished or needs reconciliation | Requester and the dispatch approver, deduplicated | Success / failure / recovery |
| Relevant membership/role/group changes | Current membership managers | Membership and access |
| Order still awaiting approval | Current responsible Platform Engineers | Reminders: at most three, at least 24 hours apart |
| Open invitation expires within 24 hours | Inviter, if still a membership manager | Reminders: once per invitation |

Only existing workflow transitions generate messages. This feature adds no new
approval-withdrawal, ownership-transfer or infrastructure action. A retry of the
same event does not create a second inbox entry. Historical completed operations
are not retroactively emailed. Events start with this migration; pending orders
and invitations can produce the documented bounded reminders.

## Invitations

In **Members**, workspace membership managers can search members by name or email,
filter by role and edit roles directly on a person's row. Removal requires a
confirmation naming the person and workspace; it removes workspace access, not
the account. The last membership manager must transfer that permission before
removing themselves. Members without management permission see their own access;
the member directory and pending invitations remain manager-only.

Choose **Invite person** and select one method:

- **Invite by email:** enter the recipient and message language, select roles,
  then choose **Send invitation**. The link is generated and queued automatically;
  there is no separate link-generation step.
- **Share a link yourself:** select roles and choose **Create invitation link**,
  then copy the one-time link and share it yourself.

The **Invitations** tab shows recipient addresses, roles, expiry and delivery
status. A manually shared link is explicitly unassigned until someone accepts it.
Pending/sending email states refresh automatically while this tab is open; a
manual refresh is also available. Revocation names the recipient or identifies
the link. SMTP acceptance confirms handoff, not inbox delivery.

The invitation and its outbox entry commit together. An emailed invitation can only be previewed and
accepted by an account with that matching, verified, non-revoked STACKIT email.
Manually shared invitations preserve their existing bearer-link semantics. Both
flows require login, explicit acceptance and an unexpired, unrevoked invitation.
An invitation grants Configurator membership, never STACKIT IAM access.

The invitation token is encrypted with authenticated, context-bound encryption
in the private outbox, not stored in plaintext in SQL. It is removed after SMTP
acceptance or a terminal outcome, or after seven days without dispatch. The
invitation hash remains the source of truth. Do not copy invitation URLs into
logs or issue comments. The invitation list shows queued, sending, accepted,
suppressed, failed or uncertain email state without exposing the encrypted token.

Emailed invitations are limited to 20 per inviter per hour across workspaces;
failed queue creation rolls back the invitation. Delivery batches are bounded.

## Delivery and privacy

Mail uses STACKIT branding, an embedded wordmark, accessible HTML and a plain-text
alternative. Messages contain fixed event descriptions and authenticated links,
not credentials, State, Plan output, logs, rejection reasons or infrastructure
settings. Workflow details stay in the application. No tracking pixel or remote
attachment fetching is used.

Recipients are resolved from current workspace/workflow participation. Ordinary
mail goes to the recipient's last verified, non-revoked STACKIT identity address,
not a user-editable order owner or arbitrary address. SMTP delivery rechecks
membership, applicable role, event visibility and personal preference. An expired
login token does not erase the previously verified email; revoked identity proof
or removed access prevents delivery. Removing access also removes that workspace's
messages from the accessible inbox. Mail already handed to SMTP cannot be recalled.

Private SQL functions isolate inbox, preferences and delivery maintenance; the
runtime role cannot read the outbox tables directly. Every app replica may poll;
transactional claims and `SKIP LOCKED` prevent duplicate dispatch. Safe transient
failures retry at most five attempts, with exponential delays. Permanent SMTP
rejections stop. Lost DATA acknowledgements, a database failure after SMTP
acceptance and abandoned sender leases become **uncertain**, without blind resend.
The original workflow is never retried or changed because email failed.

**Accepted by the mail server is not delivered to the user's inbox.** MailOut
handles bounces and suppression; operators inspect its message history and metrics
for delivery outcomes. Failed/uncertain ordinary messages remain visible in the
inbox; invitation managers see invitation delivery state. Logs use fixed diagnostic
codes, never raw provider responses, addresses or message bodies. Email payloads
are eligible for at most seven days; inbox metadata is deleted after 90 days.

For sender setup, protected release bindings, disable/rotation and MailOut delivery
diagnostics, see the [operator runbook](../infra/mailout/README.md).
