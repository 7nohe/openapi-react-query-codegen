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
export const KNOWN = new Map();

const FAILING_SEVERITIES = new Set(["high", "critical"]);

/**
 * `npm audit` exits non-zero both when it finds advisories and when it cannot
 * audit at all (registry or network errors). The workflow ignores the exit
 * code, so tell the two apart here: a real report always carries the
 * per-severity counts, and a failed run carries an `error` object instead.
 * @param {unknown} report
 */
export function assertAuditReport(report) {
  const counts = /** @type {any} */ (report)?.metadata?.vulnerabilities;
  const error = /** @type {any} */ (report)?.error;
  if (error || !counts || typeof counts !== "object") {
    const detail = JSON.stringify(error ?? report).slice(0, 500);
    throw new Error(`npm audit did not produce a report: ${detail}`);
  }
}

/**
 * @param {{ vulnerabilities?: Record<string, { via: (string | Record<string, any>)[] }> }} report
 * @param {Map<string, string>} [known]
 */
export function reviewAudit(report, known = KNOWN) {
  /** @type {Map<string, { id: string, name: string, severity: string, title: string, range: string, known: boolean, failing: boolean }>} */
  const advisories = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    for (const via of entry.via) {
      if (typeof via !== "object" || !via.url) continue;
      const id = String(via.url).split("/").pop();
      if (!id || advisories.has(id)) continue;
      const isKnown = known.has(id);
      advisories.set(id, {
        id,
        name: via.name,
        severity: via.severity,
        title: via.title,
        range: via.range,
        known: isKnown,
        failing: FAILING_SEVERITIES.has(via.severity) && !isKnown,
      });
    }
  }
  return [...advisories.values()];
}

/**
 * @param {ReturnType<typeof reviewAudit>} advisories
 * @param {Map<string, string>} [known]
 */
export function formatSummary(advisories, known = KNOWN) {
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
          ? `known: ${known.get(a.id)}`
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
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
    assertAuditReport(report);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
  const advisories = reviewAudit(report);
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
