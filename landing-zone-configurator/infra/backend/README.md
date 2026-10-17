# Remote state protection

[English](README.md) | [Deutsch](README.de.md)

<a id="remote-state-absicherung"></a>

This root manages `aws_s3_bucket_versioning` at the STACKIT S3 endpoint. No AWS resources are created. The bucket and S3 credentials from the already applied bootstrap root are prerequisites.

The real initial Plan showed that the S3 provider already needs existing credentials during planning. This configuration is therefore a separate root, not a special `-target` run within the bootstrap root.

The wrapper passes credentials only through the process environment. This root uses its own state key in the management bucket. Provider access to the workload bucket and backend access to the management bucket are passed separately. The platform root may initialize its remote backend only after versioning has been applied. [Operator instructions](../README.md).

This root has not yet been applied. The equivalent seed-protection root successfully enabled versioning on the management bucket; version recovery was verified there. Concurrent OpenTofu access and complete disaster recovery remain to be tested.
