#!/usr/bin/env bash
set -euo pipefail
umask 077
# Provider extraction needs 256 MiB; other phases retain the 64 MiB file cap.
if [[ "${1:-}" == initializing ]]; then
  ulimit -f 262144
else
  ulimit -f 65536
fi
mode="${2:-initial-plan-only}"
case "$mode:${1:-}" in
  application-destroy-plan:initializing|application-destroy-plan:validating|application-destroy-plan:planning|application-drift-plan:initializing|application-drift-plan:validating|application-drift-plan:planning)
    test "${LZC_BACKEND_KIND:-}" = s3 || exit 1
    ;;
  initial-plan-only:initializing|initial-plan-only:validating|initial-plan-only:planning|platform-plan:initializing|platform-plan:validating|platform-plan:planning|platform-apply:initializing|platform-apply:validating) ;;
  platform-apply:applying)
    test -f saved-plan.bin && test ! -L saved-plan.bin && test -s saved-plan.bin || exit 1
    ;;
  platform-apply:migrating) ;;
  *) exit 1 ;;
esac
if [ "$mode" != initial-plan-only ] && { [ "${LZC_BACKEND_KIND:-bootstrap}" = bootstrap ] || [ "${1:-}" = migrating ]; }; then
  test -n "${TF_HTTP_ADDRESS:-}" && test -n "${TF_HTTP_LOCK_ADDRESS:-}" && test -n "${TF_HTTP_UNLOCK_ADDRESS:-}" || exit 1
  test "${TF_HTTP_USERNAME:-}" = runner && test -n "${TF_HTTP_PASSWORD:-}" || exit 1
  test "${TF_HTTP_LOCK_METHOD:-}" = POST && test "${TF_HTTP_UNLOCK_METHOD:-}" = POST || exit 1
fi
if [ "$mode" != initial-plan-only ]; then
  case "${LZC_BACKEND_KIND:-bootstrap}" in
    bootstrap) test "${1:-}" != migrating || exit 1 ;;
    s3)
      test -f backend.tf.json && test ! -L backend.tf.json || exit 1
      test -n "${AWS_ACCESS_KEY_ID:-}" && test -n "${AWS_SECRET_ACCESS_KEY:-}" || exit 1
      test "${AWS_REGION:-}" = eu01 && test "${AWS_DEFAULT_REGION:-}" = eu01 || exit 1
      if [ "${1:-}" != migrating ]; then
        test -z "${TF_HTTP_ADDRESS:-}${TF_HTTP_LOCK_ADDRESS:-}${TF_HTTP_UNLOCK_ADDRESS:-}${TF_HTTP_USERNAME:-}${TF_HTTP_PASSWORD:-}" || exit 1
      fi
      ;;
    *) exit 1 ;;
  esac
fi
case "${1:-}" in
  initializing)
    if [ "$mode" = initial-plan-only ]; then
      tofu init -backend=false -input=false -no-color -lockfile=readonly > init.log 2>&1
    else
      tofu init -input=false -no-color -lockfile=readonly -lock-timeout=0s > init.log 2>&1
    fi
    ;;
  validating)
    tofu validate -no-color > validate.log 2>&1
    ;;
  migrating)
    tofu init -migrate-state -force-copy -input=false -no-color -lockfile=readonly > migration.log 2>&1
    ;;
  planning)
    plan_flag=""
    case "$mode" in
      application-destroy-plan) plan_flag="-destroy" ;;
      application-drift-plan) plan_flag="-refresh=true" ;;
    esac
    set +e
    tofu plan ${plan_flag:+"$plan_flag"} -input=false -no-color -parallelism=4 -lock-timeout=0s -detailed-exitcode -var-file=landing-zone.tfvars -out=plan.bin > plan.log 2>&1
    plan_exit=$?
    set -e
    if [ "$plan_exit" -ne 0 ] && [ "$plan_exit" -ne 2 ]; then exit 1; fi
    printf '%s' "$plan_exit" > plan.exit
    tofu show -json plan.bin > plan.json 2> show.log
    ;;
  applying)
    exec tofu apply -input=false -no-color -parallelism=4 -lock-timeout=0s saved-plan.bin > apply.log 2>&1
    ;;
  *) exit 1 ;;
esac
