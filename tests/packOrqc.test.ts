import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("scripts/pack-orqc.mjs", () => {
  let destination: string;
  let main: { name: string; version: string; engines: { node: string } };
  let tarball: string;

  beforeAll(async () => {
    destination = await mkdtemp(path.join(tmpdir(), "orqc-pack-test-"));
    execFileSync("node", ["scripts/pack-orqc.mjs", destination], {
      cwd: root,
      stdio: "ignore",
    });
    main = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    tarball = path.join(destination, `7nohe-orqc-${main.version}.tgz`);
  });

  afterAll(async () => {
    await rm(destination, { recursive: true, force: true });
  });

  test("packs the alias at the main version, depending on exactly that version", () => {
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
        encoding: "utf8",
      }),
    );
    expect(manifest.name).toBe("@7nohe/orqc");
    expect(manifest.version).toBe(main.version);
    expect(manifest.dependencies).toEqual({ [main.name]: main.version });
    expect(manifest.engines).toEqual({ node: main.engines.node });
    expect(manifest.bin).toEqual({ orqc: "bin/orqc.mjs" });
    expect(manifest.private).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
  });

  test("ships only the bin script and the readme", () => {
    const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .sort();
    expect(files).toEqual([
      "package/README.md",
      "package/bin/orqc.mjs",
      "package/package.json",
    ]);
  });
});
