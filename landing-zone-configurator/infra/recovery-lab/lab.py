#!/usr/bin/env python3
"""Local, disposable PostgreSQL recovery lab. Never connects to a remote service."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / ".private"
PROJECT = "lzc-recovery-lab"
SERVICES = ("source", "restored")


def run(args, *, data=None):
    # Do not inherit Docker/Compose contexts, remote endpoints or cloud credentials.
    env = {k: v for k, v in os.environ.items() if k in
           ("PATH", "HOME", "LANG", "XDG_RUNTIME_DIR")}
    env["DOCKER_HOST"] = "unix:///var/run/docker.sock"
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=env, timeout=180)
    if result.returncode:
        raise RuntimeError("lab command failed; output withheld to protect backup contents")
    return result.stdout


def compose(*args, data=None):
    return run(["docker", "compose", "--project-name", PROJECT,
                "--file", str(ROOT / "compose.yaml"), *args], data=data)


def private_dir():
    if PRIVATE.is_symlink():
        raise RuntimeError("private directory must not be a symlink")
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    if PRIVATE.stat().st_uid != os.getuid():
        raise RuntimeError("private directory owner mismatch")
    PRIVATE.chmod(0o700)
    password = PRIVATE / "database-password"
    if not password.exists():
        write_private(password, secrets.token_urlsafe(32).encode())
    if password.is_symlink() or not password.is_file() or password.stat().st_uid != os.getuid():
        raise RuntimeError("invalid password file")
    password.chmod(0o600)


def write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)


def container(service):
    if service not in SERVICES:
        raise RuntimeError("unknown lab service")
    ident = compose("ps", "--quiet", service).decode().strip()
    if not ident or "\n" in ident:
        raise RuntimeError("lab service missing")
    found = json.loads(run(["docker", "inspect", ident]))[0]
    labels = found["Config"].get("Labels", {})
    if (labels.get("com.docker.compose.project") != PROJECT or
        labels.get("com.docker.compose.service") != service or
        labels.get("io.stackit.lzc.recovery-lab") != "true"):
        raise RuntimeError("refusing an unmanaged container")
    return ident


def sql(service, statement):
    return run(["docker", "exec", "--interactive", container(service), "psql",
                "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only",
                "--no-align", "--username", "postgres", "--dbname", "configurator_test"],
               data=statement.encode())



def check_existing():
    ids = run(["docker", "ps", "--all", "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"]).decode().splitlines()
    for ident in ids:
        found = json.loads(run(["docker", "inspect", ident]))[0]
        labels = found["Config"].get("Labels", {})
        if (labels.get("com.docker.compose.service") not in SERVICES or
            labels.get("io.stackit.lzc.recovery-lab") != "true"):
            raise RuntimeError("refusing unmanaged resources in lab project")
    for name in ("source_data", "restored_data"):
        names = run(["docker", "volume", "ls", "--quiet", "--filter", f"name=^{PROJECT}_{name}$"]).decode().splitlines()
        if names:
            found = json.loads(run(["docker", "volume", "inspect", f"{PROJECT}_{name}"]))[0]
            labels = found.get("Labels") or {}
            if labels.get("com.docker.compose.project") != PROJECT or labels.get("com.docker.compose.volume") != name:
                raise RuntimeError("refusing unmanaged lab volume")


def up():
    private_dir()
    check_existing()
    compose("up", "--detach", "--wait", "--wait-timeout", "90")
    for service in SERVICES:
        ident = container(service)
        found = json.loads(run(["docker", "inspect", ident]))[0]
        networks = found["NetworkSettings"]["Networks"]
        if len(networks) != 1:
            raise RuntimeError("unexpected lab network")
        network = json.loads(run(["docker", "network", "inspect", next(iter(networks))]))[0]
        if not network.get("Internal"):
            raise RuntimeError("lab network must block external routing")
        for bindings in (found["NetworkSettings"].get("Ports") or {}).values():
            for binding in bindings or []:
                if binding["HostIp"] != "127.0.0.1":
                    raise RuntimeError("non-loopback lab listener")
    print(json.dumps({"event": "recovery-lab-ready", "services": list(SERVICES),
                      "externalRouting": False, "cloudExecution": False}))


def backup():
    ident = container("source")
    roles = run(["docker", "exec", ident, "pg_dumpall", "--username", "postgres", "--roles-only"])
    # The target already has postgres. Only product roles are restored; retain owners/ACLs.
    selected = []
    for line in roles.decode().splitlines():
        if line.startswith(("CREATE ROLE configurator_", "ALTER ROLE configurator_", "GRANT ")):
            selected.append(line)
    archive = run(["docker", "exec", ident, "pg_dump", "--username", "postgres",
                   "--format=custom", "--dbname", "configurator_test"])
    name = f"backup-{time.time_ns()}"
    folder = PRIVATE / name
    folder.mkdir(mode=0o700)
    write_private(folder / "roles.sql", ("\n".join(selected) + "\n").encode())
    write_private(folder / "database.dump", archive)
    write_private(folder / "manifest.json", json.dumps({
        "databaseSha256": hashlib.sha256(archive).hexdigest(),
        "rolesSha256": hashlib.sha256((folder / "roles.sql").read_bytes()).hexdigest(),
        "origin": "local-recovery-lab-only", "format": 1,
        "databaseOwner": sql("source", "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database();").decode().strip(),
    }).encode())
    return folder


def restore(folder):
    # Accept only backups created inside this lab; arbitrary/customer dumps are not an input.
    if folder.is_symlink() or folder.resolve().parent != PRIVATE.resolve():
        raise RuntimeError("only private local lab backups are accepted")
    manifest = json.loads((folder / "manifest.json").read_bytes())
    archive = (folder / "database.dump").read_bytes()
    roles = (folder / "roles.sql").read_bytes()
    if (manifest.get("origin") != "local-recovery-lab-only" or
        manifest.get("databaseSha256") != hashlib.sha256(archive).hexdigest() or
        manifest.get("rolesSha256") != hashlib.sha256(roles).hexdigest()):
        raise RuntimeError("backup integrity check failed")
    owner = manifest.get("databaseOwner")
    if owner not in ("postgres", "configurator_migration"):
        raise RuntimeError("unsupported lab database owner")
    ident = container("restored")
    # Rebuild only the disposable restored database, never source or another service.
    run(["docker", "exec", ident, "dropdb", "--username", "postgres", "--if-exists", "configurator_test"])
    run(["docker", "exec", ident, "createdb", "--username", "postgres", "configurator_test"])
    # Existing product roles are intentionally retained; this is idempotent on repeated restore.
    existing = sql("restored", "SELECT rolname FROM pg_roles WHERE rolname LIKE 'configurator_%';").decode().splitlines()
    statements = [line for line in roles.decode().splitlines()
                  if not any(line == f"CREATE ROLE {role};" for role in existing)]
    sql("restored", "\n".join(statements))
    run(["docker", "exec", "--interactive", ident, "pg_restore", "--username", "postgres",
         "--exit-on-error", "--dbname", "configurator_test"], data=archive)
    sql("restored", f'ALTER DATABASE configurator_test OWNER TO "{owner}";')
    print(json.dumps({"event": "recovery-lab-restored", "integrity": "passed",
                      "target": "restored", "cloudExecution": False}))




def migrate_fixture():
    directory = ROOT.parent.parent / "app" / "apps" / "api" / "db"
    sql("source", "DO $$ BEGIN "
        "IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN; END IF; "
        "IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN; END IF; "
        "END $$; ALTER DATABASE configurator_test OWNER TO configurator_migration;")
    sql("source", "SET ROLE configurator_migration; "
        "CREATE TABLE IF NOT EXISTS public.lzc_schema_migrations(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); "
        "REVOKE ALL ON public.lzc_schema_migrations FROM PUBLIC,configurator_app;")
    applied = {}
    for line in sql("source", "SELECT version || ':' || sha256 FROM public.lzc_schema_migrations;").decode().splitlines():
        name, digest = line.split(":")
        applied[name] = digest
    files = sorted(directory.glob("[0-9][0-9][0-9]_*.sql"))
    if not files or set(applied) - {f.name for f in files}:
        raise RuntimeError("fixture migration files missing")
    statements = ["BEGIN; SET ROLE configurator_migration; SELECT pg_advisory_xact_lock(17804291);"]
    for file in files:
        content = file.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if file.name in applied:
            if applied[file.name] != digest:
                raise RuntimeError("fixture applied migration changed")
            continue
        statements.append(content.decode())
        statements.append(f"INSERT INTO public.lzc_schema_migrations(version,sha256) VALUES('{file.name}','{digest}');")
    statements.append("COMMIT;")
    sql("source", "\n".join(statements))
    print(json.dumps({"event": "recovery-lab-fixture-schema", "migrations": len(files),
                      "cloudExecution": False}))


def snapshot(service):
    tables = sql(service, "SELECT schemaname || '.' || tablename FROM pg_tables "
                 "WHERE schemaname IN ('lzc','lzc_auth','recovery_lab_probe') "
                 "OR (schemaname='public' AND tablename='lzc_schema_migrations') "
                 "ORDER BY schemaname,tablename;").decode().splitlines()
    content = {}
    for table in tables:
        schema, name = table.split(".", 1)
        quoted = '.'.join('"' + part.replace('"', '""') + '"' for part in (schema, name))
        rows = sql(service, f"SELECT row_to_json(t)::text FROM {quoted} t ORDER BY row_to_json(t)::text;")
        content[table] = hashlib.sha256(rows).hexdigest()
    # Owners, ACLs and RLS are part of restoration, not merely row counts.
    security = sql(service, "SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity, "
                   "ARRAY(SELECT ROW(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)::text "
                   "FROM aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a "
                   "ORDER BY 1) "
                   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                   "WHERE n.nspname IN ('lzc','lzc_auth') ORDER BY n.nspname,c.relname;")
    functions = sql(service, "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,pg_get_functiondef(p.oid) "
                    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                    "WHERE n.nspname IN ('lzc','lzc_auth') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);")
    return {"tables": content, "security": hashlib.sha256(security).hexdigest(),
            "functions": hashlib.sha256(functions).hexdigest()}


def compare():
    source = snapshot("source")
    if source != snapshot("restored"):
        raise RuntimeError("restored application content/security mismatch")
    print(json.dumps({"event": "recovery-lab-compare", "result": "passed",
                      "tables": len(source["tables"]), "ownershipRlsAndFunctions": "matched"}))


def selftest():
    up()
    migrate_fixture()
    # Dedicated synthetic schema; no application tables or customer data are modified.
    sql("source", "CREATE SCHEMA IF NOT EXISTS recovery_lab_probe; "
        "CREATE TABLE IF NOT EXISTS recovery_lab_probe.records(id integer PRIMARY KEY, value text NOT NULL); "
        "INSERT INTO recovery_lab_probe.records VALUES(1,'synthetic-only') ON CONFLICT(id) DO NOTHING;")
    expected = sql("source", "SELECT md5(string_agg(id::text || ':' || value, ',' ORDER BY id)) FROM recovery_lab_probe.records;")
    folder = backup()
    restore(folder)
    actual = sql("restored", "SELECT md5(string_agg(id::text || ':' || value, ',' ORDER BY id)) FROM recovery_lab_probe.records;")
    if actual != expected:
        raise RuntimeError("restored content mismatch")
    compare()
    print(json.dumps({"event": "recovery-lab-selftest", "result": "passed",
                      "checks": ["independent-volumes", "internal-network", "backup-hashes", "restored-content"]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["up", "status", "selftest", "migrate-fixture", "backup", "restore", "compare", "stop", "destroy"])
    parser.add_argument("--backup", help="Lab-created backup directory name")
    parser.add_argument("--confirm-disposable-lab", action="store_true")
    args = parser.parse_args()
    private_dir()
    if args.action == "up": up()
    elif args.action == "selftest": selftest()
    elif args.action == "status":
        print(compose("ps", "--format", "json").decode())
    elif args.action == "backup":
        print(json.dumps({"event": "recovery-lab-backup", "name": backup().name}))
    elif args.action == "restore":
        if not args.backup or Path(args.backup).name != args.backup:
            raise RuntimeError("lab backup name required")
        restore(PRIVATE / args.backup)
    elif args.action == "compare": compare()
    elif args.action == "migrate-fixture": migrate_fixture()
    elif args.action == "stop": compose("stop")
    elif args.action == "destroy":
        if not args.confirm_disposable_lab:
            raise RuntimeError("explicit disposable-lab confirmation required")
        check_existing()
        compose("down", "--volumes")
        print(json.dumps({"event": "recovery-lab-destroyed", "privateBackupsRetained": True}))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError, KeyError) as error:
        # Never print subprocess output, credentials, SQL or backup content.
        print(json.dumps({"event": "recovery-lab-failed", "type": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
