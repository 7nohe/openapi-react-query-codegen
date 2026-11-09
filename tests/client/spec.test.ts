import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

describe("discriminators over external members", () => {
  const bundle = async (name: string, discriminator: string) => {
    await write(
      "pets.yaml",
      [
        "Cat:",
        "  type: object",
        "  properties:",
        "    petType: { type: string }",
        "Dog:",
        "  type: object",
        "  properties:",
        "    petType: { type: string }",
        "Fish:",
        "  type: object",
        "  properties:",
        "    petType: { type: string, enum: [fish] }",
        "Name:",
        "  type: string",
        "",
      ].join("\n"),
    );
    const root = await write(
      name,
      [
        "openapi: 3.1.0",
        "components:",
        "  schemas:",
        "    Pet:",
        "      oneOf:",
        "        - $ref: ./pets.yaml#/Cat",
        "        - $ref: ./pets.yaml#/Dog",
        "        - $ref: ./pets.yaml#/Fish",
        "        - $ref: ./pets.yaml#/Name",
        "        - $ref: '#/components/schemas/Bird'",
        discriminator,
        "    Bird:",
        "      type: object",
        "",
      ].join("\n"),
    );
    return (await bundleExternalRefs(await loadSpec(root))).components.schemas
      .Pet.oneOf;
  };

  test("take the value from the name", async () => {
    const [cat, dog, fish, name, bird] = await bundle(
      "disc-implicit.yaml",
      "      discriminator: { propertyName: petType }",
    );
    expect(cat.allOf[1].properties.petType.enum).toEqual(["Cat"]);
    expect(cat.allOf[1].required).toEqual(["petType"]);
    expect(dog.allOf[1].properties.petType.enum).toEqual(["Dog"]);
    // Pinned already, not an object, and still a reference.
    expect(fish.allOf).toBeUndefined();
    expect(name.type).toBe("string");
    expect(bird.$ref).toBe("#/components/schemas/Bird");
  });

  test("take the value from the mapping", async () => {
    const [cat] = await bundle(
      "disc-mapped.yaml",
      [
        "      discriminator:",
        "        propertyName: petType",
        "        mapping:",
        "          kitty: ./pets.yaml#/Cat",
      ].join("\n"),
    );
    expect(cat.allOf[1].properties.petType.enum).toEqual(["kitty"]);
  });
});

describe("percent-encoded file names", () => {
  test("are decoded, and a stray percent sign is left alone", async () => {
    await write("models v1.yaml", "Thing:\n  type: string\n");
    await write("100%.yaml", "Thing:\n  type: number\n");
    const root = await write(
      "encoded-root.yaml",
      [
        "openapi: 3.0.0",
        "components:",
        "  schemas:",
        "    A:",
        "      $ref: ./models%20v1.yaml#/Thing",
        "    B:",
        "      $ref: ./100%.yaml#/Thing",
        "",
      ].join("\n"),
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    expect(bundled.components.schemas.A).toEqual({ type: "string" });
    expect(bundled.components.schemas.B).toEqual({ type: "number" });
  });
});

describe("file URLs", () => {
  test("work for the specification and for a $ref", async () => {
    const target = await write("file-url-target.yaml", "type: string\n");
    const root = await write(
      "file-url-root.yaml",
      `openapi: 3.0.0\ncomponents:\n  schemas:\n    A:\n      $ref: ${pathToFileURL(target).href}\n`,
    );
    const loaded = await loadSpec(pathToFileURL(root).href);
    expect(loaded.location).toBe(root);
    const bundled = await bundleExternalRefs(loaded);
    expect(bundled.components.schemas.A).toEqual({ type: "string" });
  });
});

describe("flow-style YAML", () => {
  test("is read, even though it starts like JSON", async () => {
    const yaml =
      '{openapi: 3.0.3, info: {title: Test, version: "1"}, paths: {}}';
    expect((await loadSpec(yaml)).doc.openapi).toBe("3.0.3");
    const file = await write("flow.yaml", yaml);
    expect((await loadSpec(file)).doc.info.title).toBe("Test");
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

describe("bundleExternalRefs: what a $ref means", () => {
  test("data keywords are copied, even when they hold a $ref", async () => {
    const dangling = { $ref: "./does-not-exist.yaml" };
    const doc = {
      components: {
        schemas: {
          Pet: {
            type: "object",
            example: dangling,
            default: dangling,
            "x-extra": dangling,
            examples: [dangling],
          },
        },
        examples: { one: { value: dangling } },
      },
    };
    await expect(
      bundleExternalRefs({ doc, location: "/nowhere/root.yaml" }),
    ).resolves.toEqual(doc);
  });

  test("names that look like data keywords are still walked", async () => {
    await write("named.yaml", "type: string\n");
    const root = await write(
      "named-root.yaml",
      [
        "openapi: 3.0.0",
        "paths:",
        "  /x:",
        "    get:",
        "      responses:",
        "        default:",
        "          $ref: ./named.yaml",
        "components:",
        "  schemas:",
        "    Pet:",
        "      type: object",
        "      properties:",
        "        example:",
        "          $ref: ./named.yaml",
        "        properties:",
        "          type: object",
        "          example:",
        "            $ref: ./does-not-exist.yaml",
        "",
      ].join("\n"),
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    expect(bundled.paths["/x"].get.responses.default).toEqual({
      type: "string",
    });
    const pet = bundled.components.schemas.Pet;
    expect(pet.properties.example).toEqual({ type: "string" });
    expect(pet.properties.properties.example.$ref).toBe(
      "./does-not-exist.yaml",
    );
  });

  test("a file pointing back into the root keeps the named type", async () => {
    await write(
      "backref.yaml",
      "type: object\nproperties:\n  owner:\n    $ref: ./backref-root.yaml#/components/schemas/Owner\n",
    );
    const root = await write(
      "backref-root.yaml",
      "openapi: 3.0.0\ncomponents:\n  schemas:\n    Owner:\n      type: string\n    Pet:\n      $ref: ./backref.yaml\n",
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    expect(bundled.components.schemas.Pet.properties.owner).toEqual({
      $ref: "#/components/schemas/Owner",
    });
    expect(Object.keys(bundled.components.schemas)).toEqual(["Owner", "Pet"]);
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
      "A",
      "Holder",
      "a",
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

describe("redirected specifications", () => {
  const stubRedirect = () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requested.push(url);
        const body =
          url === "https://x.test/spec"
            ? JSON.stringify({
                openapi: "3.0.3",
                paths: {},
                components: {
                  schemas: { Pet: { $ref: "./models.json#/Pet" } },
                },
              })
            : JSON.stringify({ Pet: { type: "object" } });
        const response = new Response(body);
        Object.defineProperty(response, "url", {
          value:
            url === "https://x.test/spec"
              ? "https://x.test/v1/openapi.json"
              : url,
        });
        return response;
      }),
    );
    return requested;
  };

  test("relative references resolve against the final URL", async () => {
    const requested = stubRedirect();
    const loaded = await loadSpec("https://x.test/spec");
    expect(loaded.location).toBe("https://x.test/v1/openapi.json");
    const bundled = await bundleExternalRefs(loaded);
    expect(requested).toContain("https://x.test/v1/models.json");
    expect(bundled.components.schemas.Pet).toEqual({ type: "object" });
  });
});

describe("keywords next to an external $ref", () => {
  test("OpenAPI 3.1 keeps them", async () => {
    await write(
      "sib/base.yaml",
      "type: object\nproperties:\n  a:\n    type: string\n",
    );
    const root = await write(
      "sib/root.yaml",
      [
        "openapi: 3.1.0",
        "paths: {}",
        "components:",
        "  schemas:",
        "    Child:",
        "      $ref: ./base.yaml",
        "      description: docs",
        "      required: [extra]",
        "      properties:",
        "        extra:",
        "          type: string",
      ].join("\n"),
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    const child = bundled.components.schemas.Child;
    expect(child.allOf[0].properties.a).toEqual({ type: "string" });
    expect(child.allOf[1].properties.extra).toEqual({ type: "string" });
    expect(child.allOf[1].required).toEqual(["extra"]);
  });

  test("OpenAPI 3.0 ignores them", async () => {
    await write("sib30/base.yaml", "type: object\n");
    const root = await write(
      "sib30/root.yaml",
      [
        "openapi: 3.0.3",
        "paths: {}",
        "components:",
        "  schemas:",
        "    Child:",
        "      $ref: ./base.yaml",
        "      properties:",
        "        extra:",
        "          type: string",
      ].join("\n"),
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    expect(bundled.components.schemas.Child).toEqual({ type: "object" });
  });

  test("a cyclic reference keeps them next to the hoisted $ref", async () => {
    await write(
      "sibcycle/node.yaml",
      [
        "type: object",
        "properties:",
        "  next:",
        "    $ref: ./node.yaml",
        "    required: [extra]",
        "    properties:",
        "      extra:",
        "        type: string",
      ].join("\n"),
    );
    const root = await write(
      "sibcycle/root.yaml",
      [
        "openapi: 3.1.0",
        "paths: {}",
        "components:",
        "  schemas:",
        "    Tree:",
        "      $ref: ./node.yaml",
      ].join("\n"),
    );
    const bundled = await bundleExternalRefs(await loadSpec(root));
    const hoisted = Object.values(bundled.components.schemas).find(
      (schema) => (schema as { properties?: unknown }).properties,
    ) as { properties: { next: Record<string, unknown> } };
    expect(hoisted.properties.next.$ref).toMatch(/^#\/components\/schemas\//);
    expect(hoisted.properties.next.required).toEqual(["extra"]);
  });
});
