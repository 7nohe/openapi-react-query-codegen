import { describe, expect, test } from "vitest";
import {
  diffLockfiles,
  formatSummary,
  installScriptsOf,
  MIN_AGE_DAYS,
  parseLockfile,
  reviewAdded,
} from "../.github/scripts/check-lockfile-changes.mjs";

const NOW = Date.parse("2026-11-10T00:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW - days * 86_400_000).toISOString();

const lockfile = (packages: string) => `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      left-pad:
        specifier: ^1.0.0
        version: 1.0.0

packages:

${packages}
snapshots:

  left-pad@1.0.0: {}
`;

const BASE = lockfile(`  left-pad@1.0.0:
    resolution: {integrity: sha512-base}

  '@scope/native@2.0.0':
    resolution: {integrity: sha512-native}
    engines: {node: '>=18'}

  quiet@1.0.0:
    resolution: {integrity: sha512-quiet}
`);

const HEAD = lockfile(`  left-pad@1.0.0:
    resolution: {integrity: sha512-base}

  '@scope/native@2.1.0':
    resolution: {integrity: sha512-native2}
    engines: {node: '>=18'}

  quiet@1.1.0:
    resolution: {integrity: sha512-quiet2}

  fresh@1.0.0:
    resolution: {integrity: sha512-fresh}

  from-git@1.0.0:
    resolution: {commit: abc, repo: https://example.com/x.git, type: git}
`);

const packuments = new Map<string, Record<string, unknown> | null>([
  [
    "@scope/native",
    {
      time: { "2.0.0": daysAgo(90), "2.1.0": daysAgo(30) },
      versions: {
        "2.0.0": { scripts: { install: "node-gyp rebuild" } },
        "2.1.0": { scripts: { install: "node-gyp rebuild" } },
      },
    },
  ],
  [
    "quiet",
    {
      time: { "1.0.0": daysAgo(400), "1.1.0": daysAgo(20) },
      versions: {
        "1.0.0": { scripts: { test: "vitest" } },
        "1.1.0": { scripts: { postinstall: "node setup.js" } },
      },
    },
  ],
  [
    "fresh",
    {
      time: { "1.0.0": daysAgo(MIN_AGE_DAYS - 0.5) },
      versions: { "1.0.0": {} },
    },
  ],
  ["from-git", null],
]);

describe("check-lockfile-changes", () => {
  test("parseLockfile reads only the packages section, scoped names included", () => {
    const parsed = parseLockfile(BASE);
    expect([...parsed.keys()]).toEqual([
      "left-pad@1.0.0",
      "@scope/native@2.0.0",
      "quiet@1.0.0",
    ]);
    expect(parsed.get("@scope/native@2.0.0")).toEqual({
      name: "@scope/native",
      version: "2.0.0",
      resolution: "{integrity: sha512-native}",
    });
  });

  test("diffLockfiles returns added versions and the base versions per name", () => {
    const { added, baseVersions } = diffLockfiles(BASE, HEAD);
    expect(added.map((p) => `${p.name}@${p.version}`)).toEqual([
      "@scope/native@2.1.0",
      "quiet@1.1.0",
      "fresh@1.0.0",
      "from-git@1.0.0",
    ]);
    expect(baseVersions.get("quiet")).toEqual(["1.0.0"]);
  });

  test("installScriptsOf treats a gypfile without scripts as an install step", () => {
    expect(installScriptsOf(undefined)).toEqual([]);
    expect(installScriptsOf({ scripts: { build: "tsc" } })).toEqual([]);
    expect(installScriptsOf({ gypfile: true })).toEqual(["binding.gyp"]);
    expect(
      installScriptsOf({ scripts: { preinstall: "a", postinstall: "b" } }),
    ).toEqual(["preinstall", "postinstall"]);
  });

  test("reviewAdded fails new install scripts, young versions and non-registry sources", () => {
    const { added, baseVersions } = diffLockfiles(BASE, HEAD);
    const results = reviewAdded(added, baseVersions, packuments, NOW);
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));

    expect(byName["@scope/native"].problems).toEqual([]);
    expect(byName["@scope/native"].notes).toEqual([
      "runs install scripts: install (as the previous version did)",
    ]);

    expect(byName.quiet.problems).toEqual([
      "runs install scripts: postinstall (new)",
    ]);

    expect(byName.fresh.problems).toEqual([
      `published 6.5 days ago (minimum ${MIN_AGE_DAYS})`,
    ]);
    expect(byName.fresh.notes).toEqual(["new package"]);

    expect(byName["from-git"].problems).toEqual([
      "not resolved from the registry with an integrity hash",
      "version not found on the npm registry",
    ]);
    expect(byName["from-git"].ageDays).toBeNull();
  });

  test("formatSummary lists only flagged versions", () => {
    const { added, baseVersions } = diffLockfiles(BASE, HEAD);
    const summary = formatSummary(
      reviewAdded(added, baseVersions, packuments, NOW),
    );
    expect(summary).toContain("4 package versions added, 3 failing.");
    expect(summary).toContain(
      "| `quiet@1.1.0` | 20.0 | ❌ runs install scripts: postinstall (new) |",
    );
    expect(summary).toContain("| `from-git@1.0.0` | - |");
    expect(summary).not.toContain("left-pad");
  });

  test("formatSummary reports a clean change without a table", () => {
    expect(formatSummary([])).toBe(
      "## Lockfile review\n\n0 package versions added, 0 failing.\n\n",
    );
  });
});
