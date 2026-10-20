#!/usr/bin/env bash
set -euo pipefail
tofu_bin=$1
mirror=$(cd "$2" && pwd)
shift 2
# Only the unpacked layout permits per-job symlinks instead of extraction.
while IFS= read -r -d '' archive; do
	filename=${archive##*/}
	if [[ ! "$filename" =~ ^terraform-provider-[^_]+_([^_]+)_([^.]+)\.zip$ ]]; then
		echo "Unexpected provider archive name" >&2
		exit 1
	fi
	destination="${archive%/*}/${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
	test ! -e "$destination"
	mkdir -p "$destination"
	unzip -q "$archive" -d "$destination"
	rm "$archive"
done < <(find "$mirror" -type f -name '*.zip' -print0)
chmod -R a-w "$mirror"
mirror_check="${mirror%/*}/provider-check.tfrc"
node --input-type=module -e 'import {writeFileSync} from "node:fs"; const path=JSON.stringify(process.argv[2]).replaceAll("${","$${").replaceAll("%{","%%{"); writeFileSync(process.argv[1],`provider_installation {\n filesystem_mirror {\n path = ${path}\n }\n}\ndisable_checkpoint = true\n`, {flag:"wx",mode:0o600})' "$mirror_check" "$mirror"
for source in "$@"; do
	test -d "$source" || continue
	TF_CLI_CONFIG_FILE="$mirror_check" "$tofu_bin" -chdir="$source" init -backend=false -input=false -lockfile=readonly -no-color
	TF_CLI_CONFIG_FILE="$mirror_check" "$tofu_bin" -chdir="$source" validate -no-color
	rm -rf "$source/.terraform"
done
rm "$mirror_check"
