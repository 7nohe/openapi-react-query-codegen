// Reads `npm audit --json` from a project that installed the packed package the
// way a user does, without this workspace's pnpm overrides and patches.
//
// Usage: node check-consumer-audit.mjs <npm audit --json output>
//
// Fails on a high or critical advisory that is not listed in KNOWN. Advisories
// in KNOWN are ones users are exposed to today and this repository cannot fix,
// so the check stays green until something new appears.
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** @type {Map<string, string>} advisory ID -> why it is accepted for now */
export const KNOWN = new Map([
  [
    "GHSA-52cp-r559-cp3m",
    "js-yaml 4.2.0 is pinned by @hey-api/json-schema-ref-parser; removed by the v4 client generator",
  ],
  [
    "GHSA-5p4m-2wfm-xmqj",
    "js-yaml 4.2.0 is pinned by @hey-api/json-schema-ref-parser; removed by the v4 client generator",
  ],
  [
    "GHSA-2883-xcg3-v3hh",
    "js-yaml 4.2.0 is pinned by @hey-api/json-schema-ref-parser; removed by the v4 client generator",
  ],
  [
    "GHSA-g3hv-75wg-m249",
    "minimatch comes through the ts-morph peer; no fixed 9.x or 10.x release",
  ],
]);

const FAILING_SEVERITIES = new Set(["high", "critical"]);

/**
 * @param {{ vulnerabilities?: Record<string, { via: (string | Record<string, any>)[] }> }} report
 */
export function reviewAudit(report) {
  /** @type {Map<string, { id: string, name: string, severity: string, title: string, range: string, known: boolean, failing: boolean }>} */
  const advisories = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via) {
      if (typeof via !== "object" || !via.url) continue;
      const id = String(via.url).split("/").pop();
      if (!id || advisories.has(id)) continue;
      const known = KNOWN.has(id);
      advisories.set(id, {
        id,
        name: via.name,
        severity: via.severity,
        title: via.title,
        range: via.range,
        known,
        failing: FAILING_SEVERITIES.has(via.severity) && !known,
      });
    }
  }
  return [...advisories.values()];
}

/** @param {ReturnType<typeof reviewAudit>} advisories */
export function formatSummary(advisories) {
  const failing = advisories.filter((a) => a.failing);
  const lines = [
    "## User install audit",
    "",
    `${advisories.length} advisories in the dependency tree users install, ${failing.length} failing.`,
    "",
  ];
  if (advisories.length > 0) {
    lines.push(
      "| Advisory | Package | Severity | Status |",
      "| --- | --- | --- | --- |",
    );
    for (const a of advisories) {
      const status = a.failing
        ? "❌ new"
        : a.known
          ? `known: ${KNOWN.get(a.id)}`
          : "below high";
      lines.push(
        `| [${a.id}](https://github.com/advisories/${a.id}) | \`${a.name}\` ${a.range} | ${a.severity} | ${status} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const [reportPath] = process.argv.slice(2);
  if (!reportPath) {
    console.error("usage: check-consumer-audit.mjs <npm audit --json output>");
    process.exit(2);
  }
  const advisories = reviewAudit(JSON.parse(readFileSync(reportPath, "utf8")));
  const summary = formatSummary(advisories);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  if (advisories.some((a) => a.failing)) process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
