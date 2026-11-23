import { applicationExecutionProfiles } from "@lzc/contracts";
import {
  type RetirementNativePhase,
  retirementAdapterCommit,
  retirementProviderLockSha256,
} from "@lzc/contracts/recovery";
import {
  effectiveInput,
  readConfigurationRecord,
  recordValues,
} from "@lzc/domain";
import { z } from "zod";
import { CredentialError } from "../credentials/profiles.js";
import { providerLockHash } from "../plans/execution.js";

const json = z.record(z.string(), z.json());
const fail = (code: string) => new CredentialError(409, code);
/** Validate captured inputs before irreversible handover as well as at dispatch. */
export function retirementSourceInputs(
  capturedSource: unknown,
  application: boolean,
  phase: RetirementNativePhase,
) {
  try {
    let variables: z.infer<typeof json>, revision: string, lock: string;
    if (application) {
      const source = z
        .object({
          sourceRevision: z.string(),
          inputs: z.object({ variables: json }),
        })
        .parse(capturedSource);
      const profile = applicationExecutionProfiles.find(
        (p) =>
          p.revision === source.sourceRevision &&
          p.status === "supported" &&
          p.maintenanceEnabled,
      );
      if (!profile) throw fail("retirement_source_unavailable");
      variables = source.inputs.variables;
      revision = profile.revision;
      lock = profile.providerLockSha256;
    } else {
      const manifest = z
        .object({
          configuration: z.unknown(),
          accelerator: z.object({ commit: z.string() }),
          platformContractNamespace: z.uuid().optional(),
        })
        .parse(
          z.object({ manifest: z.unknown() }).parse(capturedSource).manifest,
        );
      const values = recordValues(
        readConfigurationRecord(manifest.configuration),
      );
      if (phase === "private_workloads") {
        variables = json.parse({
          ...values,
          ...(manifest.platformContractNamespace
            ? {
                platform_contract_namespace: manifest.platformContractNamespace,
              }
            : {}),
        });
        revision = manifest.accelerator.commit;
        lock = providerLockHash;
      } else {
        variables = json.parse(
          Object.fromEntries(
            [
              "organization_id",
              "organization_owners",
              "organization_auditors",
              "owner_email",
              "region",
              "rm_folder_parent_id",
              "rm_folders",
              "labels",
            ]
              .map((key) => [key, effectiveInput(values, key)])
              .filter(([, value]) => value !== undefined),
          ),
        );
        variables.retirement_phase = phase;
        revision = retirementAdapterCommit;
        lock = retirementProviderLockSha256;
      }
    }

    return { variables, revision, lock };
  } catch (error) {
    if (error instanceof CredentialError) throw error;
    throw fail("retirement_source_inputs_unavailable");
  }
}
