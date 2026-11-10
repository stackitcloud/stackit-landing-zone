#!/usr/bin/env bash
set -euo pipefail
# Attestation verification requires a fixed CLI instead of the runner image's preinstall.
curl --fail --silent --show-error --location --retry 3 --connect-timeout 10 --max-time 180 \
  https://github.com/cli/cli/releases/download/v2.103.3/gh_2.103.3_linux_amd64.tar.gz \
  -o "$RUNNER_TEMP/lzc-github-cli.tar.gz"
printf '%s\n' "4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d  $RUNNER_TEMP/lzc-github-cli.tar.gz" | sha256sum --check
mkdir -p "$RUNNER_TEMP/lzc-github-cli"
tar -xzf "$RUNNER_TEMP/lzc-github-cli.tar.gz" -C "$RUNNER_TEMP/lzc-github-cli" --strip-components=1 gh_2.103.3_linux_amd64/bin/gh
printf '%s\n' "$RUNNER_TEMP/lzc-github-cli/bin" >> "$GITHUB_PATH"
