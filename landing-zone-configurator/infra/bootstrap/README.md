# State bootstrap

[English](README.md) | [Deutsch](README.de.md)

This root creates three resources: a state bucket, a credential group and time-limited S3 access. Initial bucket creation automatically enables Object Storage in the existing project.

This root uses the separate management bucket, already created through seed IaC, as an encrypted S3 backend. The downstream [backend root](../backend/README.md) enables versioning using the S3 credentials then available. The platform root subsequently uses the protected bucket.

First real Plan on 2026-09-29 for lzc-dev/eu01 succeeded: **3 to create, 0 to change, 0 to delete**. Planned credential expiry: 2026-12-28. No Apply executed. The saved Plan is encrypted and Git-ignored under `.local/bootstrap/review.tfplan` and usable for only 24 hours.

[Operator instructions](../README.md). Mock tests demonstrate the structure; activation, S3 compatibility and write permissions are demonstrated only by the subsequent integration test.

Current: remote backend initialized, real Plan with 3 creates successful; still no Apply for this root.

<a id="erster-ci-apply-erfolgreich"></a>

## First CI Apply succeeded

On 2026-09-29, bootstrap was applied on the feature branch through [run 36601941540](https://github.com/stackitcloud/stackit-landing-zone/actions/runs/36601941540): three resources created, no changes or deletions. The encrypted state in the management bucket contains all three resources. The one-time commit approval was subsequently removed. The preceding “no Apply” statements describe the earlier planning status.

The next infrastructure step is the separate backend root to enable versioning on the newly created workload state bucket. This root has not yet been applied.
