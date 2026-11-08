import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  bundleExternalRefs,
  getByPointer,
  loadSpec,
} from "../../src/client/spec.mts";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "orqc-spec-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const write = async (name: string, content: string) => {
  const file = path.join(dir, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
};

describe("loadSpec", () => {
  test("parses inline JSON", async () => {
    const { doc, location } = await loadSpec('{"openapi":"3.0.0"}');
    expect(doc).toEqual({ openapi: "3.0.0" });
    expect(location).toBeUndefined();
  });

  test("parses inline YAML", async () => {
    const { doc } = await loadSpec("openapi: 3.0.0\ninfo:\n  title: x\n");
    expect(doc.info.title).toBe("x");
  });

  test("keeps date-like YAML scalars as strings", async () => {
    const { doc } = await loadSpec("a:\n  - auto\n  - 2026-10-08\n");
    expect(doc.a).toEqual(["auto", "2026-10-08"]);
  });

  test("reads a file", async () => {
    const file = await write("api.yaml", "openapi: 3.1.0\n");
    const { doc, location } = await loadSpec(file);
    expect(doc.openapi).toBe("3.1.0");
    expect(location).toBe(file);
  });

  test("fetches a URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"openapi":"3.0.3"}', { status: 200 })),
    );
    const { doc, location } = await loadSpec("https://example.com/api.json");
    expect(doc.openapi).toBe("3.0.3");
    expect(location).toBe("https://example.com/api.json");
  });

  test("reports a failed fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("no", { status: 404, statusText: "Not Found" }),
      ),
    );
    await expect(loadSpec("https://example.com/missing.json")).rejects.toThrow(
      "404 Not Found",
    );
  });

  test("rejects a missing file", async () => {
    await expect(loadSpec("does-not-exist.yaml")).rejects.toThrow("not found");
  });

  test("rejects unparsable and non-object documents", async () => {
    await expect(loadSpec('{"a":')).rejects.toThrow("Failed to parse");
    await expect(loadSpec("- a\n- b\n")).rejects.toThrow(
      "must be a JSON/YAML object",
    );
  });
});

describe("getByPointer", () => {
  const root = { a: { "b/c": { "d~e": 1 } }, list: [10, 20] };

  test("resolves pointers, escapes and the root", () => {
    expect(getByPointer(root, "#")).toBe(root);
    expect(getByPointer(root, "#/")).toBe(root);
    expect(getByPointer(root, "#/a/b~1c/d~0e")).toBe(1);
    expect(getByPointer(root, "/list/1")).toBe(20);
  });

  test("returns undefined for missing or non-object paths", () => {
    expect(getByPointer(root, "#/missing/x")).toBeUndefined();
    expect(getByPointer(root, "#/list/0/x")).toBeUndefined();
  });
});

describe("bundleExternalRefs", () => {
  test("leaves internal refs of the root document alone", async () => {
    const doc = { a: { $ref: "#/b" }, b: { type: "string" } };
    const bundled = await bundleExternalRefs({ doc, location: undefined });
    expect(bundled).toEqual(doc);
  });

  test("inlines external files, including their internal refs", async () => {
    await write(
      "schemas/pet.yaml",
      "type: object\nproperties:\n  owner:\n    $ref: '#/definitions/Owner'\ndefinitions:\n  Owner:\n    type: string\n",
    );
    const root = await write(
      "root.yaml",
      "openapi: 3.0.0\ncomponents:\n  schemas:\n    Pet:\n      $ref: ./schemas/pet.yaml\n    Owner:\n      $ref: ./schemas/pet.yaml#/definitions/Owner\n",
    );
    const loaded = await loadSpec(root);
    const bundled = await bundleExternalRefs(loaded);
    expect(bundled.components.schemas.Pet.properties.owner).toEqual({
      type: "string",
    });
    expect(bundled.components.schemas.Owner).toEqual({ type: "string" });
  });

  test("hoists a recursive external reference into components.schemas", async () => {
    await write(
      "tree.yaml",
      "type: object\nproperties:\n  child:\n    $ref: ./tree.yaml\n",
    );
    const root = await write(
      "tree-root.yaml",
      "openapi: 3.0.0\ncomponents:\n  schemas:\n    Wrapper:\n      $ref: ./tree.yaml\n",
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    const hoisted = Object.keys(bundled.components.schemas).filter(
      (name) => name !== "Wrapper",
    );
    expect(hoisted).toHaveLength(1);
    expect(bundled.components.schemas.Wrapper.properties.child).toEqual({
      $ref: `#/components/schemas/${hoisted[0]}`,
    });
    expect(bundled.components.schemas[hoisted[0]].properties.child.$ref).toBe(
      `#/components/schemas/${hoisted[0]}`,
    );
  });

  test("hoisting reuses an existing schema name when another is taken", async () => {
    await write(
      "a.yaml",
      "type: object\nproperties:\n  me:\n    $ref: ./a.yaml\n",
    );
    const root = await write(
      "taken.yaml",
      "openapi: 3.0.0\ncomponents:\n  schemas:\n    a:\n      type: string\n    Holder:\n      $ref: ./a.yaml\n",
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    expect(Object.keys(bundled.components.schemas).sort()).toEqual([
      "Holder",
      "a",
      "a2",
    ]);
  });

  test("rejects external refs in inline content", async () => {
    const loaded = await loadSpec('{"x":{"$ref":"./other.yaml"}}');
    await expect(bundleExternalRefs(loaded)).rejects.toThrow("inline content");
  });

  test("rejects an unresolvable pointer", async () => {
    await write("empty.yaml", "a: 1\n");
    const root = await write("bad.yaml", "x:\n  $ref: ./empty.yaml#/nope\n");
    await expect(bundleExternalRefs(await loadSpec(root))).rejects.toThrow(
      "Unresolvable",
    );
  });

  test("resolves refs relative to a URL", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/schemas/s.json")
        ? new Response('{"type":"integer"}', { status: 200 })
        : new Response('{"s":{"$ref":"./schemas/s.json"}}', { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const loaded = await loadSpec("https://example.com/api/root.json");
    const bundled = await bundleExternalRefs(loaded);
    expect(bundled.s).toEqual({ type: "integer" });
    const absolute = await bundleExternalRefs({
      doc: { s: { $ref: "https://example.com/schemas/s.json" } },
      location: "/local/root.json",
    });
    expect(absolute.s).toEqual({ type: "integer" });
  });
});
