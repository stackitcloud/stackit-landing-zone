# PR 39 Review Replies (Copy/Paste)

Purpose: ready-to-post reply texts for each referenced review thread.
Status basis: current branch state with validated plan/apply in E2E context.

## Ref 01, 02, 03 (Node pools)
Implemented. We moved the default node pool model into variable defaults and kept the explicit separation between `system` and `application` pools. `allow_system_components` is only true in the `system` pool.

## Ref 04 (NGINX -> Gateway Controller)
Implemented as an alternative with Envoy Gateway and Gateway API (`Gateway` + `HTTPRoute`).
For DNS, we currently use Terraform-managed `stackit_dns_record_set` as a temporary bridge because provider-native support for `extensions.dns.gatewayApi` is still missing. This gap is tracked in Issue 41 (updated description).

## Ref 05 (Demo scope)
Implemented. Namespace demo resources are optional and only active when demo flags are enabled. They are no longer an unavoidable default path.

## Ref 06 (null provider)
Implemented. Active code no longer relies on `null_resource`/`hashicorp/null` for the reviewed paths.

## Ref 07 (Provider pinning)
Implemented. Open provider constraints were replaced with planable version ranges (`~>`) across root/module provider definitions.

## Ref 08, 09 (Input validation location)
Implemented. Input validations were moved into `variable.validation` where applicable; runtime checks are no longer used as the primary input-validation mechanism for these reviewed cases.

## Ref 10 (Deprecated API version)
Implemented. Deprecated API usages from the reviewed scope were updated to supported versions.

## Ref 11 (Debug bastion module)
Implemented. Debug bastion is now an isolated submodule (`modules/debug-bastion`) and integrated optionally from platform-kubernetes.

## Ref 12 (SNA egress routing)
Implemented. Routing-table based default route via firewall next hop is modeled for SNA egress path.

## Ref 13 (Network file consolidation)
Implemented. Relevant platform-kubernetes network files were consolidated into `2-network.tf`.

## Ref 14 (Naming suffix consistency)
Implemented in the reviewed scope.

## Ref 15 (Grafana user/password outputs)
Implemented with the agreed nuance: credentials are still used internally where needed for provisioning, but no longer exposed as broad root-level contract output. This keeps operation working while reducing unnecessary exposure.

## Ref 16, 17, 23 (SNA input simplification)
Implemented. Input model uses `sna_enabled` and optional `sna_network_area_id` instead of the previous mode-string pattern.

## Ref 18 (Single-use local)
Implemented in the reviewed scope.

## Ref 19 (depends_on placement)
Implemented in the reviewed scope (moved to resource end for readability/style consistency).

## Ref 20 (Maintenance assignment)
Implemented in the reviewed scope via simplified mapping.

## Ref 21 (SSH fallback expression)
Implemented with improved readability and validation.

## Ref 22 (Kubernetes output usage)
Implemented. Outputs were reduced to meaningful contract values; unnecessary broad/internal exposure was removed.

## Ref 24 (Root output contract)
Implemented. Root outputs were trimmed to stable/public contract surface.

## Ref 25, 26 (providers.tf simplification)
Implemented. Provider setup is reduced to necessary configuration for this stack.

## Ref 27 (Variable scope cleanup)
Implemented. Variables were moved/kept according to module ownership and root API responsibilities.

## Ref 28 (namespace service enable semantics)
Implemented. Presence of namespace-service object acts as activation signal; redundant enable semantics were removed from the reviewed API surface.

## Optional close-out note for PR thread
All review points were addressed in code. The only non-finalized platform capability is provider-native `extensions.dns.gatewayApi`; until available, we use a Terraform-managed DNS record-set bridge (`stackit_dns_record_set`) documented in Issue 41.
