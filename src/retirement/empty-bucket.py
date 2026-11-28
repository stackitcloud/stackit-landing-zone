#!/usr/bin/env python3
"""Empty one reviewed retirement bucket using AWS CLI v2; no Configurator required."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import tempfile

MAX_ENTRIES = 50000


class CleanupError(ValueError):
    """A diagnostic that contains no object names, secrets or subprocess arguments."""


def target(plan, name):
    matches = []
    for resource in plan.get("resource_changes", []):
        if resource.get("mode") != "managed" or resource.get("type") != "stackit_objectstorage_bucket":
            continue
        change = resource.get("change", {})
        if change.get("actions") != ["delete"]:
            continue
        before = change.get("before") or {}
        parts = str(before.get("id", "")).split(",")
        if len(parts) != 3 or parts[2] != name:
            continue
        project, region, bucket = parts
        if not re.fullmatch(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", project) or region not in ("eu01", "eu02"):
            raise CleanupError("Invalid bucket identity")
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket) or ".." in bucket:
            raise CleanupError("Invalid bucket name")
        if before.get("project_id", project) != project or before.get("name", bucket) != bucket:
            raise CleanupError("Bucket selectors disagree")
        matches.append((project, region, bucket))
    if len(matches) != 1:
        raise CleanupError("Select exactly one bucket scheduled for deletion in the reviewed plan")
    return matches[0]


def inventory(call, bucket):
    versions, markers, uploads = [], [], []
    for operation, collection, extras, item_name in (
        ("list-object-versions", versions, markers, "Versions"),
        ("list-multipart-uploads", uploads, [], "Uploads"),
    ):
        cursor, seen = [], set()
        while True:
            page = call(operation, ["--bucket", bucket, *cursor])
            if page.get("Name" if item_name == "Versions" else "Bucket") != bucket:
                raise CleanupError("S3 returned a different bucket")
            entries = page.get(item_name, [])
            deleted = page.get("DeleteMarkers", []) if item_name == "Versions" else []
            for item in entries + deleted:
                if not isinstance(item.get("Key"), str) or not isinstance(item.get("VersionId" if item_name == "Versions" else "UploadId"), str):
                    raise CleanupError("Incomplete S3 inventory")
            collection.extend(entries)
            extras.extend(deleted)
            if len(versions) + len(markers) + len(uploads) > MAX_ENTRIES:
                raise CleanupError("Inventory exceeds 50000 entries; use a separately reviewed large-bucket cleanup")
            if page.get("IsTruncated") is False:
                break
            if page.get("IsTruncated") is not True or not page.get("NextKeyMarker"):
                raise CleanupError("Incomplete S3 pagination")
            second = "NextVersionIdMarker" if item_name == "Versions" else "NextUploadIdMarker"
            pair = (page["NextKeyMarker"], page.get(second))
            if pair in seen:
                raise CleanupError("Repeated S3 cursor")
            seen.add(pair)
            cursor = ["--key-marker", pair[0]]
            if pair[1]:
                cursor += ["--version-id-marker" if item_name == "Versions" else "--upload-id-marker", pair[1]]
    return versions, markers, uploads


def cleanup(call, bucket, apply=False):
    versions, markers, uploads = inventory(call, bucket)
    config = call("get-object-lock-configuration", ["--bucket", bucket])
    if config.get("ObjectLockConfiguration", {}).get("ObjectLockEnabled") == "Enabled":
        for obj in versions:
            args = ["--bucket", bucket, "--key", obj["Key"], "--version-id", obj["VersionId"]]
            retention = call("get-object-retention", args).get("Retention", {})
            hold = call("get-object-legal-hold", args).get("LegalHold", {})
            until = retention.get("RetainUntilDate")
            if bool(retention.get("Mode")) != bool(until) or hold.get("Status") not in ("ON", "OFF"):
                raise CleanupError("Incomplete retention or legal-hold response")
            if hold.get("Status") == "ON" or (until and dt.datetime.fromisoformat(until.replace("Z", "+00:00")) > dt.datetime.now(dt.timezone.utc)):
                raise CleanupError("Retention or legal hold prevents cleanup; protections are not bypassed")
    print(f"{bucket}: {len(versions)} versions, {len(markers)} delete markers, {len(uploads)} multipart uploads")
    if not apply:
        return
    for upload in uploads:
        call("abort-multipart-upload", ["--bucket", bucket, "--key", upload["Key"], "--upload-id", upload["UploadId"]])
    objects = [{"Key": item["Key"], "VersionId": item["VersionId"]} for item in versions + markers]
    for start in range(0, len(objects), 1000):
        batch = objects[start:start+1000]
        result = call("delete-objects", ["--bucket", bucket, "--delete", json.dumps({"Objects": batch, "Quiet": False})])
        if result.get("Errors") or len(result.get("Deleted", [])) != len(batch):
            raise CleanupError("Some object deletions failed; no OpenTofu Apply was started by this helper")
        print(f"{bucket}: {start+len(batch)}/{len(objects)} versions/markers removed")
    remaining = inventory(call, bucket)
    current = call("list-objects-v2", ["--bucket", bucket, "--max-keys", "1"])
    if any(remaining) or current.get("Name") != bucket or current.get("IsTruncated") is not False or current.get("Contents"):
        raise CleanupError("Bucket is not empty; stop concurrent writers before retrying")
    print(f"{bucket}: empty; review and execute the native retirement plan separately")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True, help="Private tofu show -json output of the reviewed retirement plan")
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--profile", help="AWS CLI profile with S3 access to this project's bucket")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--plan-sha256")
    parser.add_argument("--confirm-bucket-contents-deletion", action="store_true")
    parser.add_argument("--confirm-state-backend-outside-target", action="store_true")
    args = parser.parse_args()
    path = Path(args.plan)
    if path.stat().st_size > 16*1024*1024:
        raise CleanupError("Plan exceeds 16 MiB")
    data = path.read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    plan = json.loads(data)
    if not re.fullmatch(r"1\.[0-9]+", str(plan.get("format_version", ""))) or plan.get("errored", False) or plan.get("complete", True) is not True or plan.get("deferred_changes"):
        raise CleanupError("A complete successful native plan is required")
    project, region, bucket = target(plan, args.bucket)
    if args.apply and (args.plan_sha256 != checksum or not args.confirm_bucket_contents_deletion or not args.confirm_state_backend_outside_target):
        raise CleanupError("Apply needs the reviewed JSON checksum and both explicit confirmations")
    print(f"Reviewed JSON SHA-256: {checksum}\nProject: {project}; region: {region}; bucket: {bucket}")
    deadline = time.monotonic() + 900
    prefix = ["aws", "--no-cli-pager", "--no-paginate", "--output", "json", "--region", region, "--endpoint-url", f"https://object.storage.{region}.onstackit.cloud"]
    if args.profile:
        prefix += ["--profile", args.profile]
    env = {**os.environ, "AWS_MAX_ATTEMPTS": "1", "AWS_PAGER": ""}

    def call(operation, parameters):
        if time.monotonic() >= deadline:
            raise CleanupError("Cleanup time limit reached; inspect progress before retrying")
        batch_path = None
        try:
            fields = {"--bucket": "Bucket", "--key": "Key", "--version-id": "VersionId", "--upload-id": "UploadId", "--key-marker": "KeyMarker", "--version-id-marker": "VersionIdMarker", "--upload-id-marker": "UploadIdMarker", "--max-keys": "MaxKeys", "--delete": "Delete"}
            payload = {}
            for index in range(0, len(parameters), 2):
                flag, value = parameters[index:index+2]
                payload[fields[flag]] = json.loads(value) if flag == "--delete" else int(value) if flag == "--max-keys" else value
            if operation == "delete-objects":
                payload["ChecksumAlgorithm"] = "MD5"
            # Avoid command-size limits and exposing private object names in process arguments.
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", prefix="lza-retire-batch-", delete=False) as batch:
                batch_path = Path(batch.name)
                json.dump(payload, batch)
            result = subprocess.run([*prefix, "s3api", operation, "--cli-input-json", "file://"+str(batch_path)], capture_output=True, text=True, env=env, timeout=30, check=False)
        finally:
            if batch_path is not None:
                batch_path.unlink(missing_ok=True)
        if result.returncode:
            if "UnsupportedChecksumAlgorithm" in result.stderr:
                raise CleanupError("Update AWS CLI v2 to a version supporting MD5 multi-object deletion")
            if operation == "get-object-lock-configuration" and "(ObjectLockConfigurationNotFoundError)" in result.stderr:
                return {}
            raise CleanupError(f"S3 operation failed: {operation}; check access and retention without publishing private output")
        return json.loads(result.stdout) if result.stdout.strip() else {}
    cleanup(call, bucket, args.apply)


if __name__ == "__main__":
    try:
        main()
    except CleanupError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, subprocess.TimeoutExpired, KeyboardInterrupt):
        print("Bucket cleanup did not complete. Review access, retention and concurrent writers. Completed deletions remain; OpenTofu was not started.", file=sys.stderr)
        sys.exit(1)
