// Reviews every package version that a pnpm lockfile change adds.
//
// Usage: node check-lockfile-changes.mjs <base pnpm-lock.yaml> <head pnpm-lock.yaml>
//
// A version fails the review when it
// - was published less than MIN_AGE_DAYS ago. Compromised releases are usually
//   caught and removed within days, so waiting keeps them out of the lockfile.
// - runs an install script that the versions already in the base lockfile did
//   not run. A benign package gaining a `postinstall` (or a `binding.gyp`,
//   which node-gyp runs by itself) is how the 2026-08-28 payload was delivered.
// - is not resolved from the npm registry with an integrity hash.
//
// Packages new to the lockfile are listed for the reviewer but do not fail it.
//
// The workflow runs this file from the base branch and only reads the head
// lockfile as text, so a pull request cannot change the check it is held to.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MIN_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];
const REGISTRY = "https://registry.npmjs.org";

/**
 * Reads the `packages:` section of a pnpm v9 lockfile.
 * @param {string} text
 * @returns {Map<string, { name: string, version: string, resolution: string }>}
 */
export function parseLockfile(text) {
  const packages = new Map();
  let inPackages = false;
  let current = null;
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) {
      inPackages = line.startsWith("packages:");
      current = null;
      continue;
    }
    if (!inPackages) continue;
    const entry = /^ {2}(\S.*):\s*$/.exec(line);
    if (entry) {
      const key = entry[1].replace(/^'(.*)'$/, "$1");
      const at = key.lastIndexOf("@");
      current = {
        name: key.slice(0, at),
        version: key.slice(at + 1),
        resolution: "",
      };
      packages.set(key, current);
      continue;
    }
    const resolution = /^ {4}resolution: (.*)$/.exec(line);
    if (resolution && current) current.resolution = resolution[1].trim();
  }
  return packages;
}

/**
 * Lists the versions the head lockfile adds, and the versions of each package
 * name that the base lockfile already had.
 * @param {string} baseText
 * @param {string} headText
 */
export function diffLockfiles(baseText, headText) {
  const base = parseLockfile(baseText);
  const head = parseLockfile(headText);
  /** @type {Map<string, string[]>} */
  const baseVersions = new Map();
  for (const pkg of base.values()) {
    const versions = baseVersions.get(pkg.name) ?? [];
    versions.push(pkg.version);
    baseVersions.set(pkg.name, versions);
  }
  const added = [...head.entries()]
    .filter(([key]) => !base.has(key))
    .map(([, pkg]) => pkg);
  return { added, baseVersions };
}

/**
 * Install-time code a published version runs: lifecycle scripts, or a
 * `binding.gyp` that npm and pnpm build without any script declaring it.
 * @param {Record<string, any> | undefined} manifest
 * @returns {string[]}
 */
export function installScriptsOf(manifest) {
  if (!manifest) return [];
  const scripts = INSTALL_SCRIPTS.filter((name) => manifest.scripts?.[name]);
  if (scripts.length === 0 && (manifest.gypfile || manifest.hasInstallScript)) {
    scripts.push("binding.gyp");
  }
  return scripts;
}

/**
 * @param {{ name: string, version: string, resolution: string }[]} added
 * @param {Map<string, string[]>} baseVersions
 * @param {Map<string, Record<string, any> | null>} packuments registry documents by package name
 * @param {number} now milliseconds since the epoch
 */
export function reviewAdded(added, baseVersions, packuments, now) {
  return added.map((pkg) => {
    const problems = [];
    const notes = [];
    const previous = baseVersions.get(pkg.name) ?? [];
    if (previous.length === 0) notes.push("new package");

    if (
      !/integrity:/.test(pkg.resolution) ||
      /tarball:|type:/.test(pkg.resolution)
    ) {
      problems.push("not resolved from the registry with an integrity hash");
    }

    const packument = packuments.get(pkg.name);
    const manifest = packument?.versions?.[pkg.version];
    const published = Date.parse(packument?.time?.[pkg.version] ?? "");
    if (!manifest || Number.isNaN(published)) {
      problems.push("version not found on the npm registry");
      return { ...pkg, problems, notes, ageDays: null };
    }

    const ageDays = (now - published) / DAY_MS;
    if (ageDays < MIN_AGE_DAYS) {
      problems.push(
        `published ${ageDays.toFixed(1)} days ago (minimum ${MIN_AGE_DAYS})`,
      );
    }

    const scripts = installScriptsOf(manifest);
    if (scripts.length > 0) {
      const ranBefore = previous.some(
        (version) => installScriptsOf(packument.versions?.[version]).length > 0,
      );
      const message = `runs install scripts: ${scripts.join(", ")}`;
      if (ranBefore) notes.push(`${message} (as the previous version did)`);
      else problems.push(`${message} (new)`);
    }
    return { ...pkg, problems, notes, ageDays };
  });
}

/** @param {string} name */
async function fetchPackument(name) {
  const response = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`registry returned ${response.status} for ${name}`);
  }
  return response.json();
}

/**
 * @param {string[]} names
 * @param {number} concurrency
 */
async function fetchPackuments(names, concurrency = 8) {
  const packuments = new Map();
  const queue = [...names];
  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      packuments.set(name, await fetchPackument(name));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return packuments;
}

/** @param {ReturnType<typeof reviewAdded>} results */
export function formatSummary(results) {
  const failed = results.filter((r) => r.problems.length > 0);
  const lines = [
    "## Lockfile review",
    "",
    `${results.length} package versions added, ${failed.length} failing.`,
    "",
  ];
  const flagged = results.filter(
    (r) => r.problems.length > 0 || r.notes.length > 0,
  );
  if (flagged.length > 0) {
    lines.push("| Package | Age (days) | Result |", "| --- | ---: | --- |");
    for (const r of flagged) {
      const age = r.ageDays === null ? "-" : r.ageDays.toFixed(1);
      const result = [
        ...r.problems.map((p) => `❌ ${p}`),
        ...r.notes.map((n) => `ℹ️ ${n}`),
      ].join("<br>");
      lines.push(`| \`${r.name}@${r.version}\` | ${age} | ${result} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const [basePath, headPath] = process.argv.slice(2);
  if (!basePath || !headPath) {
    console.error(
      "usage: check-lockfile-changes.mjs <base pnpm-lock.yaml> <head pnpm-lock.yaml>",
    );
    process.exit(2);
  }
  const { added, baseVersions } = diffLockfiles(
    readFileSync(basePath, "utf8"),
    readFileSync(headPath, "utf8"),
  );
  const packuments = await fetchPackuments([
    ...new Set(added.map((pkg) => pkg.name)),
  ]);
  const results = reviewAdded(added, baseVersions, packuments, Date.now());
  const summary = formatSummary(results);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  if (results.some((r) => r.problems.length > 0)) process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
