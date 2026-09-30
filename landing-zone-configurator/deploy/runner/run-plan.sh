#!/usr/bin/env bash
set -euo pipefail
umask 077
# Linux ulimit: cap files at 64 MiB; diagnostics remain private and bounded.
ulimit -f 65536
case "${1:-}" in
  initializing)
    tofu init -input=false -no-color -lockfile=readonly > init.log 2>&1
    ;;
  validating)
    tofu validate -no-color > validate.log 2>&1
    ;;
  planning)
    set +e
    tofu plan -input=false -no-color -parallelism=4 -detailed-exitcode -var-file=landing-zone.tfvars -out=plan.bin > plan.log 2>&1
    plan_exit=$?
    set -e
    if [ "$plan_exit" -ne 0 ] && [ "$plan_exit" -ne 2 ]; then exit 1; fi
    printf '%s' "$plan_exit" > plan.exit
    tofu show -json plan.bin > plan.json 2> show.log
    ;;
  *) exit 1 ;;
esac
