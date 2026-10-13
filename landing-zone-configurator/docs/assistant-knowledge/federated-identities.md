# Federated Operating Identities

## Purpose

Allow narrowly scoped external workload identities to operate through the
management service account without treating federation as a general login switch.

## Accelerator Contract

Native federated_identity_providers is a list of name, issuer and assertions
with item/operator/value. The management module attaches this configuration to
its service-account workflow. Federation does not create Configurator users,
replace their authorization or enable every external identity provider feature.

## Dependencies

Management operating identity, provider/IAM permissions and a verified issuer
and assertion contract. Governance rights remain independently scoped.

## Dialogue

Ask which CI/workload must act, who owns the issuer and which repository,
environment or subject assertions limit trust. Do not infer "trust all" from
a vendor name. Verify issuer/assertions before advising; never request bearer
tokens, signing keys or identity-provider secrets.

## Examples

Synthetic opt-out: federated_identity_providers = []. Enabling federation needs
an explicit reviewed issuer and least-privilege assertions, not a guessed sample
operator, wildcard subject or credentials copied from a pipeline.

## Limits

Source schema support is not issuer compatibility or successful token exchange.
Operators, claims, audience and IAM privileges need independent verification.
Complex federation changes and trust grants are not current chat patches;
no automatic identity creation or scope escalation.

## Credentials

Provisioning credentials and exchanged workload tokens stay outside configuration
history and model context. Bind credentials externally for native execution;
federation is not permission to rotate existing model/provider tokens.

## Sources

The management variable and implementation contract is authoritative. Manifest
fingerprints track the reviewed local revision, not external issuer freshness
or a production security qualification.