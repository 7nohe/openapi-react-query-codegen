import { describe, expect, test } from "vitest";
import {
  assertAuditReport,
  formatSummary,
  KNOWN,
  reviewAudit,
} from "../.github/scripts/check-consumer-audit.mjs";

const advisory = (id: string, name: string, severity: string) => ({
  source: 1,
  name,
  dependency: name,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: "<9.9.9",
});

const report = {
  vulnerabilities: {
    minimatch: {
      via: [advisory("GHSA-g3hv-75wg-m249", "minimatch", "high")],
    },
    // Parent entries repeat the chain as plain strings and must be skipped.
    "ts-morph": { via: ["minimatch"] },
    "left-pad": { via: [advisory("GHSA-aaaa-bbbb-cccc", "left-pad", "high")] },
    "is-odd": {
      via: [
        advisory("GHSA-dddd-eeee-ffff", "is-odd", "moderate"),
        advisory("GHSA-dddd-eeee-ffff", "is-odd", "moderate"),
      ],
    },
  },
};

describe("check-consumer-audit", () => {
  test("reviewAudit fails only unknown high or critical advisories", () => {
    const results = reviewAudit(report);
    expect(results.map((r) => [r.id, r.known, r.failing])).toEqual([
      ["GHSA-g3hv-75wg-m249", true, false],
      ["GHSA-aaaa-bbbb-cccc", false, true],
      ["GHSA-dddd-eeee-ffff", false, false],
    ]);
  });

  test("reviewAudit handles a clean report", () => {
    expect(reviewAudit({})).toEqual([]);
  });

  test("assertAuditReport rejects output from a failed npm audit run", () => {
    const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
    expect(() =>
      assertAuditReport({
        vulnerabilities: {},
        metadata: { vulnerabilities: counts },
      }),
    ).not.toThrow();
    expect(() =>
      assertAuditReport({
        error: { code: "ENOTFOUND", summary: "request to registry failed" },
      }),
    ).toThrow(/did not produce a report: .*ENOTFOUND/);
    expect(() => assertAuditReport({})).toThrow(/did not produce a report/);
    expect(() => assertAuditReport(null)).toThrow(/did not produce a report/);
  });

  test("every known advisory has a reason", () => {
    for (const [id, reason] of KNOWN) {
      expect(id).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  test("formatSummary marks new, known and lower-severity advisories", () => {
    const summary = formatSummary(reviewAudit(report));
    expect(summary).toContain(
      "3 advisories in the dependency tree users install, 1 failing.",
    );
    expect(summary).toContain("| high | ❌ new |");
    expect(summary).toContain("| moderate | below high |");
    expect(summary).toContain(
      "known: minimatch comes through the ts-morph peer",
    );
  });
});
