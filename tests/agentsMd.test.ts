import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  agentsFilePath,
  applyAgentsBlock,
  checkAgentsBlock,
  claudeImportHint,
  renderAgentsBlock,
  writeAgentsBlock,
} from "../src/agentsMd.mjs";
import { check } from "../src/check.mjs";
import type { LimitedUserConfig } from "../src/cli.mts";
import { generate } from "../src/generate.mjs";

const dir = path.join("tests", "outputs-agents-md");

beforeAll(async () => {
  await mkdir(dir, { recursive: true });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("agentsFilePath", () => {
  test("is AGENTS.md unless a file is named", () => {
    expect(agentsFilePath(true)).toBe("AGENTS.md");
    expect(agentsFilePath("")).toBe("AGENTS.md");
    expect(agentsFilePath("CLAUDE.md")).toBe("CLAUDE.md");
  });
});

describe("renderAgentsBlock", () => {
  const block = renderAgentsBlock("src/openapi");

  test("is wrapped in comments that carry the output path", () => {
    const lines = block.trimEnd().split("\n");
    expect(lines[0]).toBe("<!-- openapi-rq:begin src/openapi -->");
    expect(lines.at(-1)).toBe("<!-- openapi-rq:end src/openapi -->");
    expect(block.endsWith("-->\n")).toBe(true);
  });

  test("spells every path from the working directory", () => {
    expect(block).toContain("src/openapi/requests/sdk.gen.ts");
    expect(block).toContain("src/openapi/requests/types.gen.ts");
    expect(block).toContain("Import them from `src/openapi/queries`");
    // An absolute path inside the working directory is shown the same way.
    expect(renderAgentsBlock(path.resolve("src/openapi"))).toBe(block);
    expect(renderAgentsBlock("./src/openapi/")).toBe(block);
  });

  test("keeps an output outside the working directory as it was given", () => {
    expect(renderAgentsBlock("../shared/api")).toContain(
      "<!-- openapi-rq:begin ../shared/api -->",
    );
  });
});

describe("applyAgentsBlock", () => {
  const block = renderAgentsBlock("src/openapi");

  test("is the whole file when there is none, or an empty one", () => {
    expect(applyAgentsBlock(undefined, block)).toBe(block);
    expect(applyAgentsBlock("\n", block)).toBe(block);
  });

  test("goes after what the file already says", () => {
    expect(applyAgentsBlock("# Project\n\nRules.\n", block)).toBe(
      `# Project\n\nRules.\n\n${block}`,
    );
    expect(applyAgentsBlock("# Project", block)).toBe(`# Project\n\n${block}`);
  });

  test("replaces the block of the same output where it stands", () => {
    const stale = block.replace("### Names", "### Old names");
    const file = `# Project\n\n${stale}\n## After\n`;
    expect(applyAgentsBlock(file, block)).toBe(
      `# Project\n\n${block}\n## After\n`,
    );
  });

  test("changes nothing when the block is current", () => {
    const file = `# Project\n\n${block}\n## After\n`;
    expect(applyAgentsBlock(file, block)).toBe(file);
    expect(applyAgentsBlock(block, block)).toBe(block);
  });

  test("keeps the block of another output", () => {
    const other = renderAgentsBlock("src/billing");
    const both = applyAgentsBlock(block, other);
    expect(both).toBe(`${block}\n${other}`);
    expect(applyAgentsBlock(both, block)).toBe(both);
  });
});

describe("writeAgentsBlock and checkAgentsBlock", () => {
  const file = path.join(dir, "AGENTS.md");

  test("report added, then up to date, then modified", async () => {
    expect(await checkAgentsBlock(file, "src/openapi")).toEqual({
      path: "tests/outputs-agents-md/AGENTS.md",
      status: "added",
    });

    await writeFile(file, "# Project\n");
    expect((await checkAgentsBlock(file, "src/openapi"))?.status).toBe("added");

    await writeAgentsBlock(file, "src/openapi");
    expect(await readFile(file, "utf8")).toBe(
      `# Project\n\n${renderAgentsBlock("src/openapi")}`,
    );
    expect(await checkAgentsBlock(file, "src/openapi")).toBeUndefined();

    const content = await readFile(file, "utf8");
    await writeFile(file, content.replace("### Names", "### Edited"));
    expect((await checkAgentsBlock(file, "src/openapi"))?.status).toBe(
      "modified",
    );
  });
});

describe("claudeImportHint", () => {
  const hintDir = path.join(dir, "hint");
  const agents = path.join(hintDir, "AGENTS.md");
  const claude = path.join(hintDir, "CLAUDE.md");

  test("speaks up only for an AGENTS.md next to a CLAUDE.md that leaves it out", async () => {
    await mkdir(hintDir, { recursive: true });
    expect(await claudeImportHint(agents)).toBeUndefined();

    await writeFile(claude, "# Rules\n");
    expect(await claudeImportHint(agents)).toContain("@AGENTS.md");
    expect(await claudeImportHint(claude)).toBeUndefined();

    await writeFile(claude, "@AGENTS.md\n");
    expect(await claudeImportHint(agents)).toBeUndefined();
  });
});

describe("--agentsMd through generate and check", () => {
  const file = path.join(dir, "run", "AGENTS.md");
  const options: LimitedUserConfig = {
    input: path.join(__dirname, "inputs", "petstore.yaml"),
    output: path.join(dir, "run", "openapi"),
    pageParam: "page",
    nextPageParam: "nextPage",
    initialPageParam: "1",
    agentsMd: file,
  };

  test("generate writes the block and check watches it", async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await generate({ ...options }, "1.0.0", { silent: true });
    const written = await readFile(file, "utf8");
    expect(written).toBe(renderAgentsBlock(options.output));
    expect(written).toContain("tests/outputs-agents-md/run/openapi/queries");

    expect(await check({ ...options }, "1.0.0")).toEqual({
      upToDate: true,
      files: [],
    });
    // The check itself must not write the file.
    expect(await readFile(file, "utf8")).toBe(written);

    await rm(file);
    expect(await check({ ...options }, "1.0.0")).toEqual({
      upToDate: false,
      files: [
        { path: "tests/outputs-agents-md/run/AGENTS.md", status: "added" },
      ],
    });
    expect(await check({ ...options, agentsMd: undefined }, "1.0.0")).toEqual({
      upToDate: true,
      files: [],
    });
  }, 60000);
});
