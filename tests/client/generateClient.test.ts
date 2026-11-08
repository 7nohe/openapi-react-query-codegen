import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  detectImportExtension,
  generateClient,
  writeGeneratedFiles,
} from "../../src/client/index.mts";
import { generateTestClient, inputPath } from "../utils";

const file = (
  generated: { files: { name: string; content: string }[] },
  name: string,
) => generated.files.find((f) => f.name === name)?.content ?? "";

describe("generateClient - features fixture", () => {
  let generated: Awaited<ReturnType<typeof generateTestClient>>;
  beforeAll(async () => {
    generated = await generateTestClient("features.yaml");
  });

  test("emits the expected files", () => {
    expect(generated.files.map((f) => f.name)).toEqual([
      "types.gen.ts",
      "sdk.gen.ts",
      "client.gen.ts",
      "runtime.gen.ts",
      "index.ts",
      "services.gen.ts",
    ]);
  });

  test("types.gen.ts", () => {
    expect(file(generated, "types.gen.ts")).toMatchSnapshot();
  });

  test("sdk.gen.ts", () => {
    expect(file(generated, "sdk.gen.ts")).toMatchSnapshot();
  });

  test("client.gen.ts resolves server variables", () => {
    expect(file(generated, "client.gen.ts")).toContain(
      'createConfig<ClientOptions2>({ baseUrl: "https://api.example.com/v1" })',
    );
  });

  test("exposes models and service names for the hook generators", () => {
    expect(generated.modelNames).toContain("ListItemsData");
    expect(generated.modelNames).toContain("ListItemsError");
    expect(generated.modelNames).not.toContain("GetItemError");
    expect(generated.serviceNames).toEqual([
      "listItems",
      "createItem",
      "getItem",
      "replaceItem",
      "deleteItem",
      "uploadImage",
      "downloadImage",
      "getStatus",
      "addNote",
      "getEvents",
    ]);
  });

  test("normalizes operations for the hook generators", () => {
    const list = generated.operations.find(
      (op) => op.methodName === "listItems",
    );
    expect(list).toMatchObject({
      capitalizedMethodName: "ListItems",
      dataTypeName: "ListItemsData",
      httpMethod: "GET",
      allParamsOptional: false,
      isPaginatable: true,
      pageParamType: "number",
      pageParamTypeKind: "number",
    });
    expect(list?.parameters.map((p) => p.name)).toEqual([
      "page",
      "ids",
      "tags",
      "filter",
      "X-Trace-Id",
    ]);
    const create = generated.operations.find(
      (op) => op.methodName === "createItem",
    );
    expect(create?.parameters.at(-1)).toEqual({
      name: "body",
      typeName: "NewItem",
      optional: false,
    });
    const note = generated.operations.find((op) => op.methodName === "addNote");
    expect(note?.parameters).toEqual([
      { name: "body", typeName: "string", optional: true },
    ]);
    expect(
      generated.operations.find((op) => op.methodName === "deleteItem")
        ?.isDeprecated,
    ).toBe(true);
  });
});

describe("generateClient - options", () => {
  test("enums: typescript and javascript", async () => {
    const ts = await generateTestClient("features.yaml", {
      enums: "typescript",
    });
    expect(file(ts, "types.gen.ts")).toContain(
      'export enum Status {\n  Active = "active",\n  InProgress = "in-progress",\n  Archived = "archived",\n}',
    );
    expect(file(ts, "types.gen.ts")).toContain(
      "export enum Priority {\n  _1 = 1,",
    );
    const js = await generateTestClient("features.yaml", {
      enums: "javascript",
    });
    expect(file(js, "types.gen.ts")).toContain(
      'export const Status = {\n  Active: "active",',
    );
    expect(file(js, "types.gen.ts")).toContain(
      "export type Status = (typeof Status)[keyof typeof Status];",
    );
  });

  test("noOperationId names operations after the method and path", async () => {
    const generated = await generateTestClient("petstore.yaml", {
      noOperationId: true,
    });
    expect(generated.serviceNames).toEqual([
      "getPets",
      "postPets",
      "getNotDefined",
      "postNotDefined",
      "getPetsById",
      "deletePetsById",
      "getPaginatedPets",
    ]);
  });

  test("axios client uses the axios runtime and baseURL", async () => {
    const generated = await generateTestClient("petstore.yaml", {
      client: "axios",
    });
    expect(file(generated, "runtime.gen.ts")).toContain('from "axios"');
    expect(file(generated, "types.gen.ts")).toContain("baseURL:");
    expect(file(generated, "client.gen.ts")).toContain("baseURL:");
    expect(file(generated, "sdk.gen.ts")).toContain('responseType: "json"');
    expect(file(generated, "sdk.gen.ts")).not.toContain("parseAs");
  });

  test("inline content works and string-pagination keeps the page type", async () => {
    const generated = await generateTestClient("string-pagination.yaml", {
      pageParam: "cursor",
    });
    expect(generated.operations[0]).toMatchObject({
      isPaginatable: true,
      pageParamTypeKind: "string",
    });
  });

  test("rejects unsupported documents", async () => {
    const base = {
      importExtension: "" as const,
      pageParam: "page",
      client: "fetch" as const,
    };
    await expect(
      generateClient({ ...base, input: 'swagger: "2.0"\npaths: {}\n' }),
    ).rejects.toThrow("Swagger/OpenAPI 2.0");
    await expect(
      generateClient({ ...base, input: "info:\n  title: x\n" }),
    ).rejects.toThrow('Unsupported or missing "openapi"');
  });

  test("spec without servers uses a plain string baseUrl", async () => {
    const generated = await generateClient({
      input:
        'openapi: 3.0.0\npaths:\n  /a:\n    get:\n      responses:\n        "200":\n          description: ok\n',
      client: "fetch",
      importExtension: ".js",
      pageParam: "page",
    });
    expect(file(generated, "types.gen.ts")).toContain("baseUrl: string;");
    expect(file(generated, "client.gen.ts")).toContain(
      "createConfig<ClientOptions2>()",
    );
    expect(file(generated, "sdk.gen.ts")).toContain('from "./client.gen.js"');
  });
});

describe("generated client compiles", () => {
  let dir: string;
  beforeAll(async () => {
    // Inside the repo so that `axios` resolves from its node_modules.
    dir = await mkdtemp(path.join(__dirname, "compile-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const compile = async (
    name: string,
    input: string,
    client: "fetch" | "axios",
    compilerOptions: ts.CompilerOptions,
    importExtension: "" | ".js",
  ) => {
    const out = path.join(dir, name);
    const generated = await generateClient({
      input,
      client,
      importExtension,
      pageParam: "page",
      enums: "typescript",
    });
    await writeGeneratedFiles(out, generated.files);
    // NodeNext treats .ts files as CommonJS unless the package says otherwise.
    await writeFile(path.join(out, "package.json"), '{"type":"module"}');
    const program = ts.createProgram(
      generated.files.map((f) => path.join(out, f.name)),
      {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        target: ts.ScriptTarget.ES2022,
        types: [],
        ...compilerOptions,
      },
    );
    return ts
      .getPreEmitDiagnostics(program)
      .map(
        (d) =>
          `${path.basename(d.file?.fileName ?? "")}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`,
      );
  };

  const bundler: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    verbatimModuleSyntax: true,
  };
  const nodenext: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    verbatimModuleSyntax: true,
  };

  for (const input of [
    "petstore.yaml",
    "features.yaml",
    "digit-leading.yaml",
  ]) {
    test(`fetch / bundler: ${input}`, async () => {
      expect(
        await compile(`f-b-${input}`, inputPath(input), "fetch", bundler, ""),
      ).toEqual([]);
    });
    test(`fetch / NodeNext: ${input}`, async () => {
      expect(
        await compile(
          `f-n-${input}`,
          inputPath(input),
          "fetch",
          nodenext,
          ".js",
        ),
      ).toEqual([]);
    });
    test(`axios / bundler: ${input}`, async () => {
      expect(
        await compile(`a-b-${input}`, inputPath(input), "axios", bundler, ""),
      ).toEqual([]);
    });
  }
});

describe("detectImportExtension", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "orqc-ext-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const detect = async (name: string, config: unknown) => {
    const sub = path.join(dir, name);
    await mkdir(sub, { recursive: true });
    if (config !== undefined) {
      await writeFile(path.join(sub, "tsconfig.json"), JSON.stringify(config));
    }
    return detectImportExtension(sub);
  };

  test("follows moduleResolution and module", async () => {
    expect(
      await detect("bundler", {
        compilerOptions: { moduleResolution: "bundler" },
      }),
    ).toBe("");
    expect(
      await detect("nodenext", {
        compilerOptions: { moduleResolution: "nodenext" },
      }),
    ).toBe(".js");
    expect(
      await detect("node16", {
        compilerOptions: { moduleResolution: "node16" },
      }),
    ).toBe(".js");
    expect(
      await detect("module-nodenext", {
        compilerOptions: { module: "nodenext" },
      }),
    ).toBe(".js");
    expect(
      await detect("module-esnext", { compilerOptions: { module: "esnext" } }),
    ).toBe("");
  });

  test("an unreadable tsconfig yields no extension", async () => {
    const sub = path.join(dir, "broken");
    await mkdir(sub, { recursive: true });
    await writeFile(path.join(sub, "tsconfig.json"), "{ not json");
    expect(detectImportExtension(sub)).toBe("");
  });

  test("a missing tsconfig yields no extension", async () => {
    // Real walk-up: relies on os.tmpdir() having no tsconfig ancestors.
    const sub = await mkdtemp(path.join(tmpdir(), "orqc-none-"));
    try {
      expect(detectImportExtension(sub)).toBe("");
    } finally {
      await rm(sub, { recursive: true, force: true });
    }
  });
});
