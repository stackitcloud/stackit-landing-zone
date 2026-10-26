import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function copyTree(source, destination) {
  source = realpathSync(source);
  const stat = statSync(source);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source)) copyTree(join(source, name), join(destination, name));
  } else if (stat.isFile()) {
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
    chmodSync(destination, stat.mode & 0o777);
  } else throw new Error("Unsupported migration file type");
}

// Copy the installed, lockfile-resolved pg dependency closure, without another
// dependency resolution or any API/Runner/inspection payload.
export function packageMigration(release, destination) {
  release = realpathSync(release);
  destination = resolve(destination);
  if (existsSync(destination)) throw new Error("Migration destination already exists");
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, "package.json"), JSON.stringify({ private: true, type: "module" }));
  for (const file of ["migrate.js", "storage/database.js", "storage/migrations.js", "connectivity.js"])
    copy(`apps/api/dist/${file}`);
  copy("apps/api/db");
  copy("runtime/bin/node");
  copy("runtime/LICENSE");
  const seen = new Map();
  function copy(path) {
    mkdirSync(dirname(join(destination, path)), { recursive: true });
    copyTree(join(release, path), join(destination, path));
  }
  function dependency(name, parent, optional = false) {
    let entry;
    try { entry = createRequire(join(parent, "package.json")).resolve(name); }
    catch (error) { if (optional && error.code === "MODULE_NOT_FOUND") return; throw error; }
    let directory = dirname(entry), metadata;
    while (directory.startsWith(release + sep)) {
      const path = join(directory, "package.json");
      if (existsSync(path)) {
        metadata = JSON.parse(readFileSync(path, "utf8"));
        if (metadata.name === name) break;
      }
      directory = dirname(directory);
    }
    if (!directory.startsWith(join(release, "node_modules") + sep) || metadata?.name !== name)
      throw new Error(`Migration dependency outside release: ${name} (${directory}, expected ${release})`);
    directory = realpathSync(directory);
    if (seen.has(name)) {
      if (seen.get(name) !== directory) throw new Error("Conflicting migration dependency versions");
      return;
    }
    seen.set(name, directory);
    const target = join(destination, "node_modules", name);
    mkdirSync(dirname(target), { recursive: true });
    copyTree(directory, target);
    for (const dep of Object.keys(metadata.dependencies ?? {})) dependency(dep, directory);
    for (const dep of Object.keys(metadata.optionalDependencies ?? {})) dependency(dep, directory, true);
  }
  dependency("pg", release);
  return [...seen.keys()].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log("Migration dependency closure:", packageMigration(process.argv[2], process.argv[3]).join(", "));
