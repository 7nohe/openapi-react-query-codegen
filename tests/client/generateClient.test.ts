import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  detectImportExtension,
  generateClient,
  writeGeneratedFiles,
} from "../../src/client/index.mts";
import { generate } from "../../src/generate.mjs";
import { buildGetNextPageParamExpr } from "../../src/hooks/buildQueryHooks.mjs";
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
    expect(
      generated.operations.find((op) => op.methodName === "deleteItem")?.jsDoc,
    ).toContain("@deprecated");
  });
});

describe("generateClient - options", () => {
  test("enums: typescript and javascript", async () => {
    const ts = await generateTestClient("features.yaml", {
      enums: "typescript",
    });
    expect(file(ts, "types.gen.ts")).toContain(
      'export enum Status {\n  ACTIVE = "active",\n  IN_PROGRESS = "in-progress",\n  ARCHIVED = "archived",\n}',
    );
    expect(file(ts, "types.gen.ts")).toContain(
      "export enum Priority {\n  _1 = 1,",
    );
    const js = await generateTestClient("features.yaml", {
      enums: "javascript",
    });
    expect(file(js, "types.gen.ts")).toContain(
      'export const Status = {\n  ACTIVE: "active",',
    );
    expect(file(js, "types.gen.ts")).toContain(
      "export type Status = (typeof Status)[keyof typeof Status];",
    );
    expect(file(js, "types.gen.ts")).toContain(
      "export const Priority = {\n  1: 1,",
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

  test("a colliding type name is renumbered on its own and reported to the hooks", async () => {
    const generated = await generateClient({
      input: [
        "openapi: 3.0.0",
        "paths:",
        "  /a:",
        "    get:",
        "      operationId: listRuns",
        "      responses:",
        '        "200": { description: ok, content: { application/json: { schema: { $ref: "#/components/schemas/ListRunsResponse" } } } }',
        '        "404": { description: no, content: { application/json: { schema: { type: string } } } }',
        "components:",
        "  schemas:",
        "    ListRunsResponse: { type: object }",
        "    ListRunsError: { type: string }",
      ].join("\n"),
      client: "fetch",
      importExtension: "",
      pageParam: "page",
    });
    const types = file(generated, "types.gen.ts");
    expect(types).toContain("export type ListRunsData = {");
    expect(types).toContain(
      "export type ListRunsResponse2 = ListRunsResponses[keyof ListRunsResponses];",
    );
    expect(types).toContain(
      "export type ListRunsError2 = ListRunsErrors[keyof ListRunsErrors];",
    );
    expect(generated.operations[0]).toMatchObject({
      dataTypeName: "ListRunsData",
      errorTypeName: "ListRunsError2",
    });
    const sdk = file(generated, "sdk.gen.ts");
    expect(sdk).toContain(
      "RequestResult<ListRunsResponses, ListRunsErrors, ThrowOnError>",
    );
  });

  test.each(["typescript", "javascript"] as const)(
    "%s enums follow the x-enum extensions",
    async (enums) => {
      const generated = await generateClient({
        input: JSON.stringify({
          openapi: "3.0.3",
          paths: {},
          components: {
            schemas: {
              Level: {
                type: "integer",
                enum: [1, 2, 3],
                "x-enum-varnames": ["Low", "mediumLevel"],
                "x-enum-descriptions": ["lowest"],
              },
              Color: {
                type: "string",
                enum: ["r"],
                "x-enumNames": ["Red"],
              },
            },
          },
        }),
        client: "fetch",
        enums,
        importExtension: "",
        pageParam: "page",
      });
      const types = file(generated, "types.gen.ts");
      const assign = enums === "typescript" ? " = " : ": ";
      expect(types).toContain(`LOW${assign}1,`);
      expect(types).toContain(`MEDIUM_LEVEL${assign}2,`);
      // A list that runs out falls back to the value.
      expect(types).toMatch(new RegExp(`\\b_?3${assign}3,`));
      expect(types).toContain(`RED${assign}"r",`);
      expect(types).toMatch(/\* Low\n\s+\*\n\s+\* lowest\n/);
    },
  );

  test("javascript enums can hold null and booleans, as in v3", async () => {
    const enumsOf = async (enums: "typescript" | "javascript") =>
      file(
        await generateClient({
          input: JSON.stringify({
            openapi: "3.0.3",
            paths: {},
            components: {
              schemas: {
                Status: { type: "string", enum: ["active", null] },
                Flag: { type: "boolean", enum: [true, false] },
                OnlyNull: { enum: [null] },
              },
            },
          }),
          client: "fetch",
          enums,
          importExtension: "",
          pageParam: "page",
        }),
        "types.gen.ts",
      );
    const javascript = await enumsOf("javascript");
    expect(javascript).toContain('ACTIVE: "active",');
    expect(javascript).toContain("NULL: null,");
    expect(javascript).toContain("TRUE: true,");
    expect(javascript).toContain("export type OnlyNull = null;");
    const typescript = await enumsOf("typescript");
    expect(typescript).toContain('export type Status = "active" | null;');
    expect(typescript).toContain("export type Flag = true | false;");
  });

  test.each(["typescript", "javascript"] as const)(
    "%s enums with leading zeros compile",
    async (enums) => {
      const generated = await generateClient({
        input: JSON.stringify({
          openapi: "3.0.3",
          paths: {},
          components: {
            schemas: { Status: { type: "string", enum: ["01", "0", "10"] } },
          },
        }),
        client: "fetch",
        enums,
        importExtension: "",
        pageParam: "page",
      });
      const types = file(generated, "types.gen.ts");
      if (enums === "javascript") {
        expect(types).toContain('"01": "01",');
        expect(types).toContain('0: "0",');
        expect(types).toContain('10: "10",');
      } else {
        expect(types).toContain('_01 = "01",');
      }
      expect(
        ts.transpileModule(types, { reportDiagnostics: true }).diagnostics,
      ).toEqual([]);
    },
  );

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
    overrides: Partial<Parameters<typeof generateClient>[0]> = {},
  ) => {
    const out = path.join(dir, name);
    const generated = await generateClient({
      input,
      client,
      importExtension,
      pageParam: "page",
      enums: "typescript",
      ...overrides,
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

  // The optional files: `transformers.gen.ts` must not leave anything unused,
  // and `schemas.gen.ts` has to hold whatever a schema is named.
  const optional = { useDateType: true, schemas: "json" } as const;
  for (const input of ["dates.yaml", "features.yaml", "hostile-names.yaml"]) {
    test(`fetch / NodeNext with dates and schemas: ${input}`, async () => {
      expect(
        await compile(
          `o-f-n-${input}`,
          inputPath(input),
          "fetch",
          { ...nodenext, noUnusedLocals: true, noUnusedParameters: true },
          ".js",
          optional,
        ),
      ).toEqual([]);
    });
    test(`axios / bundler with dates and schemas: ${input}`, async () => {
      expect(
        await compile(
          `o-a-b-${input}`,
          inputPath(input),
          "axios",
          { ...bundler, noUnusedLocals: true, noUnusedParameters: true },
          "",
          optional,
        ),
      ).toEqual([]);
    });
  }
});

describe("request-side variants", () => {
  test("exist even when no request uses the schema, as in v3", async () => {
    const generated = await generateClient({
      input: JSON.stringify({
        openapi: "3.0.3",
        components: {
          schemas: {
            Pet: {
              type: "object",
              required: ["id", "name"],
              properties: {
                id: { type: "string", readOnly: true },
                name: { type: "string" },
              },
            },
          },
        },
        paths: {
          "/pet": {
            get: {
              operationId: "getPet",
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Pet" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      client: "fetch",
      importExtension: "",
      pageParam: "page",
    });
    expect(file(generated, "types.gen.ts")).toMatch(
      /export type PetWritable = \{\s+name: string;\s+\};/,
    );
  });
});

describe("parameters use the request-side types", () => {
  test("a writeOnly property of a parameter stays", async () => {
    const generated = await generateClient({
      input: JSON.stringify({
        openapi: "3.0.3",
        components: {
          schemas: {
            Credentials: {
              type: "object",
              required: ["username", "password"],
              properties: {
                username: { type: "string" },
                password: { type: "string", writeOnly: true },
              },
            },
          },
        },
        paths: {
          "/login": {
            get: {
              operationId: "login",
              parameters: [
                {
                  name: "credentials",
                  in: "query",
                  required: true,
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Credentials" },
                    },
                  },
                },
              ],
              responses: { "204": { description: "none" } },
            },
          },
        },
      }),
      client: "fetch",
      importExtension: "",
      pageParam: "page",
    });
    const types = file(generated, "types.gen.ts");
    expect(types).toContain("credentials: CredentialsWritable;");
    expect(types).toMatch(
      /type CredentialsWritable = \{[^}]*password: string;/,
    );
  });
});

describe("shared request bodies and default responses", () => {
  const json = (schema: unknown) => ({
    content: { "application/json": { schema } },
  });
  const pet = { $ref: "#/components/schemas/Pet" };
  const err = { $ref: "#/components/schemas/Err" };
  const make = () =>
    generateClient({
      input: JSON.stringify({
        openapi: "3.0.3",
        components: {
          schemas: {
            Pet: {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string", readOnly: true } },
            },
            Err: { type: "object", properties: { code: { type: "number" } } },
          },
          requestBodies: {
            // Takes the next free name: the schema and the operation keep theirs.
            Pet: { description: "A pet to store", ...json(pet) },
            SavePetData: json({ type: "string" }),
            Upload: {
              content: {
                "application/xml": { schema: { type: "string" } },
                "application/json": { schema: { type: "number" } },
              },
            },
            Empty: { description: "Nothing" },
            Alias: { $ref: "#/components/requestBodies/Upload" },
            Lost: { $ref: "#/components/requestBodies/Nowhere" },
          },
        },
        paths: {
          "/pet": {
            post: {
              operationId: "savePet",
              requestBody: { $ref: "#/components/requestBodies/Pet" },
              responses: { default: { description: "d", ...json(pet) } },
            },
            get: {
              operationId: "getPet",
              responses: {
                "200": { description: "ok", ...json(pet) },
                default: { description: "d", ...json(err) },
              },
            },
            delete: {
              operationId: "dropPet",
              responses: {
                "404": { description: "nf", ...json(err) },
                default: { description: "d" },
              },
            },
          },
        },
      }),
      client: "fetch",
      importExtension: "",
      pageParam: "page",
    });

  test("a request body is a named type, as it is sent", async () => {
    const generated = await make();
    const types = file(generated, "types.gen.ts");
    expect(types).toContain(
      "/**\n * A pet to store\n */\nexport type Pet2 = PetWritable;",
    );
    expect(types).toContain("export type SavePetData2 = string;");
    expect(types).toContain("export type Upload = number;");
    expect(types).toContain(
      "/**\n * Nothing\n */\nexport type Empty = unknown;",
    );
    expect(types).toContain("export type Alias = number;");
    expect(types).toContain("export type Lost = unknown;");
    expect(types).toMatch(/type SavePetData = \{[^}]*body\?: PetWritable;/);
    expect(generated.modelNames).toEqual(
      expect.arrayContaining(["Pet2", "SavePetData2", "Upload", "Lost"]),
    );
  });

  test("default is the data without a 2xx and an error with one", async () => {
    const generated = await make();
    const types = file(generated, "types.gen.ts");
    expect(types).toMatch(/type SavePetResponses = \{[^}]*default: Pet;/);
    expect(types).not.toContain("SavePetError");
    expect(types).toMatch(/type GetPetErrors = \{[^}]*default: Err;/);
    expect(types).toMatch(/type GetPetResponses = \{[^}]*200: Pet;\s+\}/);
    expect(types).toMatch(/type DropPetErrors = \{[^}]*404: Err;\s+\}/);
    expect(types).toMatch(/type DropPetResponses = \{[^}]*default: unknown;/);

    const errorOf = (name: string) =>
      generated.operations.find((op) => op.methodName === name)?.errorTypeName;
    expect(errorOf("savePet")).toBeUndefined();
    expect(errorOf("getPet")).toBe("GetPetError");
    expect(errorOf("dropPet")).toBe("DropPetError");
  });
});

describe("a next page property that is not an identifier", () => {
  test("is quoted in the type and in the access", () => {
    const expr = buildGetNextPageParamExpr({
      nextPageParam: "meta.next-page",
    } as never);
    expect(expr).toBe(
      '(response: unknown) => (response as { meta: { "next-page": number } }).meta?.["next-page"]',
    );
    expect(
      ts.transpileModule(`export const f = ${expr};`, {
        reportDiagnostics: true,
      }).diagnostics,
    ).toEqual([]);
  });
});

describe("a next page property inside something optional", () => {
  test("ends the pagination instead of throwing", () => {
    const expr = buildGetNextPageParamExpr({
      nextPageParam: "meta.next",
    } as never);
    const js = ts.transpileModule(`(${expr})`, {}).outputText;
    // biome-ignore lint/security/noGlobalEval: evaluates the expression above
    const next = (0, eval)(js);
    expect(next({ meta: { next: 2 } })).toBe(2);
    expect(next({ items: [] })).toBeUndefined();
    expect(next({ meta: null })).toBeUndefined();
  });
});

describe("a page parameter that is not an identifier", () => {
  test("is quoted in the query it builds", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "orqc-page-"));
    try {
      const input = path.join(dir, "spec.json");
      await writeFile(
        input,
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "t", version: "1" },
          paths: {
            "/x": {
              get: {
                operationId: "listX",
                parameters: [
                  {
                    name: "page[number]",
                    in: "query",
                    schema: { type: "integer" },
                  },
                ],
                responses: {
                  "200": {
                    description: "ok",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: { next: { type: "integer" } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      await generate(
        {
          input,
          output: path.relative(process.cwd(), dir),
          client: "fetch",
          pageParam: "page[number]",
          nextPageParam: "next",
          initialPageParam: "1",
        },
        "1.0.0",
      );
      const text = await readFile(
        path.join(dir, "queries", "infiniteQueries.ts"),
        "utf-8",
      );
      expect(text).toContain('"page[number]": pageParam');
      const { diagnostics } = ts.transpileModule(text, {
        reportDiagnostics: true,
      });
      expect(diagnostics).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("names beyond ASCII", () => {
  test("hooks import what they use", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "orqc-unicode-"));
    try {
      const output = path.relative(process.cwd(), dir);
      const input = path.join(dir, "spec.json");
      await writeFile(
        input,
        JSON.stringify({
          openapi: "3.0.3",
          info: { title: "t", version: "1" },
          paths: {
            "/x": {
              get: {
                operationId: "検索",
                responses: {
                  "200": {
                    description: "ok",
                    content: {
                      "application/json": { schema: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        }),
      );
      await generate(
        {
          input,
          output,
          client: "fetch",
          pageParam: "page",
          nextPageParam: "next",
          initialPageParam: "1",
        },
        "1.0.0",
      );
      const common = await readFile(
        path.join(dir, "queries", "common.ts"),
        "utf-8",
      );
      expect(common).toMatch(/import \{[^}]*検索[^}]*\} from/);
      const queries = await readFile(
        path.join(dir, "queries", "queries.ts"),
        "utf-8",
      );
      expect(queries).toMatch(/import type \{[^}]*検索Data[^}]*\} from/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
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
    expect(
      await detect("module-preserve", {
        compilerOptions: { module: "preserve" },
      }),
    ).toBe("");
  });

  test.each(["node16", "node18", "node20"])(
    "module %s needs extensions",
    async (module) => {
      expect(
        await detect(`module-${module}`, { compilerOptions: { module } }),
      ).toBe(".js");
    },
  );

  test("an unreadable tsconfig yields no extension", async () => {
    const sub = path.join(dir, "broken");
    await mkdir(sub, { recursive: true });
    await writeFile(path.join(sub, "tsconfig.json"), "{ not json");
    expect(detectImportExtension(sub)).toBe("");
    await writeFile(path.join(sub, "tsconfig.json"), "null");
    expect(detectImportExtension(sub)).toBe("");
  });

  test("reads a tsconfig with comments, trailing commas and a BOM", async () => {
    const sub = path.join(dir, "jsonc");
    await mkdir(sub, { recursive: true });
    await writeFile(
      path.join(sub, "tsconfig.json"),
      `\uFEFF{
  // "moduleResolution": "bundler",
  "compilerOptions": {
    /* "module": "esnext", */
    "paths": { "a//b": ["/* not a comment */", "x,]"], },
    "module": "NodeNext", // the value is not case-sensitive
  },
}
/* unfinished`,
    );
    expect(detectImportExtension(sub)).toBe(".js");
  });

  // The generator must not need the `typescript` package to read a tsconfig,
  // so that it runs next to TypeScript 7, which has no API for it. These
  // cases hold what TypeScript itself makes of each config.
  describe("agrees with TypeScript", () => {
    const write = async (file: string, config: unknown) => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(
        file,
        typeof config === "string" ? config : JSON.stringify(config),
      );
    };

    /** What TypeScript resolves, turned into the same answer. */
    const viaTypeScript = (sub: string): "" | ".js" => {
      const configPath = path.join(sub, "tsconfig.json");
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      const { options } = ts.parseJsonConfigFileContent(
        read.config,
        ts.sys,
        sub,
      );
      const resolution =
        options.moduleResolution ??
        (options.module !== undefined &&
        options.module >= ts.ModuleKind.Node16 &&
        options.module <= ts.ModuleKind.NodeNext
          ? ts.ModuleResolutionKind.NodeNext
          : undefined);
      return resolution === ts.ModuleResolutionKind.Node16 ||
        resolution === ts.ModuleResolutionKind.NodeNext
        ? ".js"
        : "";
    };

    const cases: Array<[string, Record<string, unknown>, "" | ".js"]> = [
      ["no options", { "tsconfig.json": {} }, ""],
      [
        "a parent in the same folder",
        {
          "tsconfig.json": { extends: "./base.json" },
          "base.json": { compilerOptions: { module: "nodenext" } },
        },
        ".js",
      ],
      [
        "a parent named without its extension",
        {
          "tsconfig.json": { extends: "./configs/base" },
          "configs/base.json": {
            compilerOptions: { moduleResolution: "node16" },
          },
        },
        ".js",
      ],
      [
        "its own options over the parent's",
        {
          "tsconfig.json": {
            extends: "./base.json",
            compilerOptions: { moduleResolution: "bundler" },
          },
          "base.json": { compilerOptions: { moduleResolution: "nodenext" } },
        },
        "",
      ],
      [
        "the resolution of the parent over its own module",
        {
          "tsconfig.json": {
            extends: "./base.json",
            compilerOptions: { module: "nodenext" },
          },
          "base.json": { compilerOptions: { moduleResolution: "bundler" } },
        },
        "",
      ],
      [
        "a chain of parents",
        {
          "tsconfig.json": { extends: "./a.json" },
          "a.json": { extends: "./b.json", compilerOptions: { strict: true } },
          "b.json": { compilerOptions: { module: "node18" } },
        },
        ".js",
      ],
      [
        "several parents, the later one first",
        {
          "tsconfig.json": { extends: ["./a.json", "./b.json"] },
          "a.json": { compilerOptions: { moduleResolution: "nodenext" } },
          "b.json": { compilerOptions: { moduleResolution: "bundler" } },
        },
        "",
      ],
      [
        "a grandparent reached twice",
        {
          "tsconfig.json": { extends: ["./a.json", "./b.json"] },
          "a.json": {
            extends: "./root.json",
            compilerOptions: { moduleResolution: "bundler" },
          },
          "b.json": { extends: "./root.json" },
          "root.json": { compilerOptions: { moduleResolution: "nodenext" } },
        },
        ".js",
      ],
      [
        "a parent from a package",
        {
          "tsconfig.json": { extends: "@scope/base/tsconfig.json" },
          "node_modules/@scope/base/package.json": { name: "@scope/base" },
          "node_modules/@scope/base/tsconfig.json": {
            compilerOptions: { module: "node20" },
          },
        },
        ".js",
      ],
      [
        "a package named on its own",
        {
          "tsconfig.json": { extends: "plain-base" },
          "node_modules/plain-base/package.json": { name: "plain-base" },
          "node_modules/plain-base/tsconfig.json": {
            compilerOptions: { moduleResolution: "nodenext" },
          },
        },
        ".js",
      ],
      [
        "a file of a package named without its extension",
        {
          "tsconfig.json": { extends: "plain-base/strict" },
          "node_modules/plain-base/package.json": { name: "plain-base" },
          "node_modules/plain-base/strict.json": {
            compilerOptions: { moduleResolution: "node16" },
          },
        },
        ".js",
      ],
      [
        "a parent that is not there",
        {
          "tsconfig.json": {
            extends: ["./missing.json", "no-such-package", 1],
            compilerOptions: { module: "nodenext" },
          },
        },
        ".js",
      ],
      [
        "a parent that cannot be parsed",
        {
          "tsconfig.json": {
            extends: "./broken.json",
            compilerOptions: { module: "nodenext" },
          },
          "broken.json": "{ not json",
        },
        ".js",
      ],
      [
        "parents that extend each other",
        {
          "tsconfig.json": { extends: "./a.json" },
          "a.json": {
            extends: "./tsconfig.json",
            compilerOptions: { module: "nodenext" },
          },
        },
        ".js",
      ],
      [
        "values of another type",
        {
          "tsconfig.json": {
            compilerOptions: { module: 199, moduleResolution: null },
          },
        },
        "",
      ],
    ];

    test.each(cases)("%s", async (name, files, expected) => {
      const sub = path.join(dir, "ts", name.replaceAll(" ", "-"));
      for (const [file, config] of Object.entries(files)) {
        await write(path.join(sub, file), config);
      }
      expect(detectImportExtension(sub)).toBe(expected);
      // TypeScript reports an error for a parent it cannot load and for a
      // circle, and then goes on without it, as the generator does.
      expect(viaTypeScript(sub)).toBe(expected);
    });
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

describe("serialization and parsing the SDK asks for", () => {
  const operation = async (
    client: "fetch" | "axios",
    definition: Record<string, unknown>,
    url = "/x",
  ) => {
    const generated = await generateClient({
      input: JSON.stringify({
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          [url]: { get: { operationId: "op", ...definition } },
        },
        components: {
          schemas: {
            Obj: { type: "object", properties: { r: { type: "string" } } },
            Id: { type: "integer" },
          },
          securitySchemes: {
            a: { type: "apiKey", in: "header", name: "X-A" },
            b: { type: "apiKey", in: "header", name: "X-B" },
          },
        },
      }),
      client,
      importExtension: "",
      pageParam: "page",
    });
    const sdk = generated.files.find((f) => f.name === "sdk.gen.ts")?.content;
    return sdk?.replace(/\s+/g, " ") ?? "";
  };
  const ok = (content: Record<string, unknown>) => ({
    description: "ok",
    content,
  });
  const json = { "application/json": { schema: { type: "string" } } };
  const text = { "text/plain": { schema: { type: "string" } } };
  const query = (parameter: Record<string, unknown>) => ({
    parameters: [{ name: "p", in: "query", ...parameter }],
    responses: { "204": { description: "none" } },
  });
  const obj = { type: "object", properties: { r: { type: "string" } } };
  const list = { type: "array", items: { type: "string" } };

  test("one parser when every success body reads the same way", async () => {
    const sdk = await operation("axios", {
      responses: {
        "200": ok(json),
        "201": ok(json),
        "204": { description: "none" },
      },
    });
    expect(sdk).toContain('responseType: "json"');
    expect(sdk).not.toContain("parseAs");
  });

  test("no fixed parser when success bodies differ", async () => {
    const mixed = { responses: { "200": ok(json), "202": ok(text) } };
    expect(await operation("axios", mixed)).not.toContain("responseType");
  });

  test("a scheme's key is emitted when it needs one", async () => {
    const generated = await generateClient({
      input: JSON.stringify({
        openapi: "3.0.3",
        components: {
          securitySchemes: {
            user: { type: "http", scheme: "bearer" },
            admin: { type: "http", scheme: "bearer" },
            k1: { type: "apiKey", in: "header", name: "X" },
            k2: { type: "apiKey", in: "header", name: "X" },
          },
        },
        paths: {
          "/x": {
            get: {
              operationId: "op",
              security: [{ user: [] }, { k2: [] }],
              responses: { "204": { description: "none" } },
            },
          },
        },
      }),
      client: "fetch",
      importExtension: "",
      pageParam: "page",
    });
    const sdk = file(generated, "sdk.gen.ts");
    expect(sdk).toContain('{ key: "user", scheme: "bearer", type: "http" }');
    expect(sdk).toContain(
      '{ in: "header", key: "k2", name: "X", type: "apiKey" }',
    );
  });

  test("fetch leaves parsing to the response and the client", async () => {
    const sdk = await operation("fetch", {
      responses: { "200": ok(json) },
    });
    expect(sdk).not.toContain("parseAs");
  });

  test("no fixed parser when one response offers both", async () => {
    const sdk = await operation("axios", {
      responses: { "200": ok({ ...json, ...text }) },
    });
    expect(sdk).not.toContain("responseType");
  });

  test("error bodies do not decide how success is parsed", async () => {
    const sdk = await operation("axios", {
      responses: { "200": ok(text), "400": ok(json) },
    });
    expect(sdk).toContain('responseType: "text"');
  });

  test.each([
    ["application/xml", "text"],
    ["application/atom+xml; charset=utf-8", "text"],
    ["application/octet-stream", "blob"],
  ])("a %s body is read as %s", async (mediaType, responseType) => {
    const sdk = await operation("axios", {
      responses: { "200": ok({ [mediaType]: { schema: { type: "string" } } }) },
    });
    expect(sdk).toContain(`responseType: "${responseType}"`);
  });

  test("a 3.1 type list keeps the settings of every shape", async () => {
    const mixed = { type: ["string", "object"], properties: { id: {} } };
    const sdk = await operation(
      "fetch",
      {
        parameters: [
          { name: "p", in: "query", schema: mixed },
          {
            name: "id",
            in: "path",
            required: true,
            explode: true,
            schema: mixed,
          },
          { name: "n", in: "query", schema: { type: ["string", "null"] } },
          { name: "m", in: "query", schema: { type: ["string", "number"] } },
        ],
        responses: { "204": { description: "none" } },
      },
      "/x/{id}",
    );
    expect(sdk).toContain('"p": { object: { style: "form", explode: true } }');
    expect(sdk).toContain('"id": { style: "simple", explode: true }');
    expect(sdk).not.toContain('"n":');
    expect(sdk).not.toContain('"m":');
  });

  test("a header with JSON content is listed for the runtime", async () => {
    const header = (name: string, media: string) => ({
      name,
      in: "header",
      content: { [media]: { schema: list } },
    });
    const sdk = await operation("axios", {
      parameters: [
        header("X-F", "application/json"),
        header("X-T", "text/csv"),
      ],
      responses: { "204": { description: "none" } },
    });
    expect(sdk).toContain('jsonHeaders: ["X-F"]');
  });

  test("a parameter with JSON content is sent as a JSON text", async () => {
    const sdk = await operation(
      "fetch",
      {
        parameters: [
          {
            name: "filter",
            in: "query",
            content: { "application/json": { schema: obj } },
          },
          {
            name: "id",
            in: "path",
            required: true,
            content: { "application/vnd.x+json": { schema: obj } },
          },
          {
            name: "note",
            in: "query",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        ],
        responses: { "204": { description: "none" } },
      },
      "/x/{id}",
    );
    expect(sdk).toContain(
      'querySerializer: { parameters: { "filter": { json: true } } }',
    );
    expect(sdk).toContain(
      'pathSerializer: { parameters: { "id": { json: true } } }',
    );
    expect(sdk).not.toContain('"note"');
  });

  test.each(["fetch", "axios"] as const)(
    "%s keeps a non-default array style",
    async (client) => {
      const sdk = await operation(
        client,
        query({ schema: list, style: "form", explode: false }),
      );
      expect(sdk).toContain(
        'parameters: { "p": { array: { style: "form", explode: false } } }',
      );
    },
  );

  test("delimited styles default to not exploding", async () => {
    const sdk = await operation(
      "fetch",
      query({ schema: list, style: "pipeDelimited" }),
    );
    expect(sdk).toContain('array: { style: "pipeDelimited", explode: false }');
  });

  test("an object without a style uses the OpenAPI default", async () => {
    for (const schema of [obj, { $ref: "#/components/schemas/Obj" }]) {
      expect(await operation("fetch", query({ schema }))).toContain(
        '"p": { object: { style: "form", explode: true } }',
      );
    }
  });

  test("deepObject and default arrays need no override", async () => {
    for (const parameter of [
      { schema: obj, style: "deepObject", explode: true },
      { schema: list },
      { schema: { type: "string" }, style: "form", explode: false },
    ]) {
      expect(await operation("fetch", query(parameter))).not.toContain(
        "querySerializer",
      );
    }
  });

  test("a primitive behind a composition or an enum needs no override", async () => {
    for (const schema of [
      { allOf: [{ type: "integer" }] },
      { allOf: [{ $ref: "#/components/schemas/Id" }], description: "an id" },
      { anyOf: [{ type: "integer" }, { type: "string" }] },
      { oneOf: [{ type: "string" }, { type: "boolean" }], nullable: true },
      { enum: ["a", "b"] },
    ]) {
      const sdk = await operation("fetch", query({ schema }));
      expect(sdk, JSON.stringify(schema)).not.toContain("querySerializer");
      const path = await operation(
        "fetch",
        {
          parameters: [
            { name: "id", in: "path", required: true, explode: true, schema },
          ],
          responses: { "204": { description: "none" } },
        },
        "/x/{id}",
      );
      expect(path, JSON.stringify(schema)).not.toContain("pathSerializer");
    }
  });

  test("an array or an object behind a composition gets its own setting", async () => {
    expect(
      await operation(
        "fetch",
        query({ schema: { allOf: [list] }, explode: false }),
      ),
    ).toContain('"p": { array: { style: "form", explode: false } } }');
    expect(
      await operation(
        "fetch",
        query({ schema: { allOf: [obj, { required: ["r"] }] } }),
      ),
    ).toContain('"p": { object: { style: "form", explode: true } } }');
  });

  test("a schema that can hold either shape gets both settings", async () => {
    const sdk = await operation(
      "fetch",
      query({ schema: { anyOf: [list, obj] }, explode: false }),
    );
    expect(sdk).toContain(
      '"p": { array: { style: "form", explode: false }, object: { style: "form", explode: false } }',
    );
  });

  test.each(["fetch", "axios"] as const)(
    "%s passes path styles to the runtime",
    async (client) => {
      const sdk = await operation(
        client,
        {
          parameters: [
            {
              name: "m",
              in: "path",
              required: true,
              style: "matrix",
              explode: true,
              schema: obj,
            },
            {
              name: "l",
              in: "path",
              required: true,
              style: "label",
              schema: list,
            },
            { name: "s", in: "path", required: true, schema: list },
            {
              name: "o",
              in: "path",
              required: true,
              explode: true,
              schema: obj,
            },
            {
              name: "t",
              in: "path",
              required: true,
              explode: true,
              schema: { type: "string" },
            },
          ],
          responses: { "204": { description: "none" } },
        },
        "/x/{m}/{l}/{s}/{o}/{t}",
      );
      expect(sdk).toContain(
        'pathSerializer: { parameters: { "m": { style: "matrix", explode: true }, "l": { style: "label", explode: false }, "o": { style: "simple", explode: true } } }',
      );
    },
  );

  test("schemes required together are grouped", async () => {
    const sdk = await operation("fetch", {
      security: [{ a: [], b: [] }, { a: [] }],
      responses: { "204": { description: "none" } },
    });
    expect(sdk).toContain(
      'security: [[{ in: "header", name: "X-A", type: "apiKey" }, { in: "header", name: "X-B", type: "apiKey" }], { in: "header", name: "X-A", type: "apiKey" }]',
    );
  });
});
