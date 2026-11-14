import { describe, expect, test } from "vitest";
import {
  type ClientGenOptions,
  generateClient,
} from "../../src/client/index.mjs";
import { generateTestClient } from "../utils";

async function mocksOf(
  inputFile: string,
  overrides: Partial<ClientGenOptions> = {},
) {
  const generated = await generateTestClient(inputFile, {
    mocks: { mswMajor: 3 },
    ...overrides,
  });
  const file = (name: string) =>
    generated.mockFiles?.find((entry) => entry.name === name)?.content ?? "";
  return {
    data: file("data.ts"),
    handlers: file("handlers.ts"),
    index: file("index.ts"),
    warnings: generated.warnings,
  };
}

/** Mocks for a specification written inline, as JSON. */
async function mocksOfDocument(document: Record<string, unknown>) {
  const generated = await generateClient({
    input: JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Inline", version: "1" },
      paths: {},
      ...document,
    }),
    client: "fetch",
    importExtension: "",
    pageParam: "page",
    mocks: { mswMajor: 3 },
  });
  const file = (name: string) =>
    generated.mockFiles?.find((entry) => entry.name === name)?.content ?? "";
  return {
    data: file("data.ts"),
    handlers: file("handlers.ts"),
    warnings: generated.warnings,
  };
}

/** The body of one generated function. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  expect(start, `${name} is generated`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}

describe("emitMocks", () => {
  test("generates nothing unless asked", async () => {
    const generated = await generateTestClient("mocks.yaml");
    expect(generated.mockFiles).toBeUndefined();
  });

  test("the mock data and the handlers of a specification", async () => {
    const mocks = await mocksOf("mocks.yaml");
    expect(mocks.data).toMatchSnapshot("data.ts");
    expect(mocks.handlers).toMatchSnapshot("handlers.ts");
    expect(mocks.index).toMatchSnapshot("index.ts");
  });

  test("the mock data with TypeScript enums and Date objects", async () => {
    const mocks = await mocksOf("mocks.yaml", {
      enums: "typescript",
      useDateType: true,
    });
    expect(mocks.data).toMatchSnapshot("data.ts");
  });

  test("relative imports take the extension of the project", async () => {
    const mocks = await mocksOf("petstore.yaml", { importExtension: ".js" });
    expect(mocks.data).toContain('from "../requests/types.gen.js"');
    expect(mocks.handlers).toContain('from "./data.js"');
    expect(mocks.index).toContain('export * from "./handlers.js"');
  });

  test("imports http from where the MSW version exports it", async () => {
    const v3 = await mocksOf("petstore.yaml");
    expect(v3.handlers).toContain('} from "msw/http";');
    const v2 = await mocksOf("petstore.yaml", { mocks: { mswMajor: 2 } });
    expect(v2.handlers).toContain('} from "msw";');
    expect(v2.handlers.replace('from "msw"', 'from "msw/http"')).toBe(
      v3.handlers,
    );
  });

  test("a specification with nothing to mock still gives valid files", async () => {
    const mocks = await mocksOfDocument({});
    expect(mocks.data).not.toContain("import");
    expect(mocks.handlers).toContain(
      'import type { HttpHandler } from "msw/http";',
    );
    expect(mocks.handlers).toContain(
      "export const handlers: HttpHandler[] = [];",
    );
    expect(mocks.handlers).not.toContain("const answer");
  });

  describe("values", () => {
    test("an example of the whole body comes first", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const body = functionBody(data, "listPetsResponseMock");
      expect(body).toContain('name: "Momo"');
      expect(body).toContain('bornAt: "2020-05-17T09:00:00Z"');
      expect(body).not.toContain("petMock()");
    });

    test("of several named examples the first with a value is taken", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const body = functionBody(data, "createPetResponseMock");
      expect(body).toContain('name: "Kuro"');
      expect(body).toContain('tags: ["black", "small"]');
      // The type has no such property, and a literal with it would not compile.
      expect(body).not.toContain("extra");
    });

    test("an example that is not a value of the schema is passed over", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "getPetResponseMock")).toContain(
        "return petMock();",
      );
      const drifted = functionBody(data, "driftedMock");
      expect(drifted).toMatchSnapshot();
      for (const wrong of ["1.5", '"yes"', '"c"', '"y"', "two", "no id"]) {
        expect(drifted).not.toContain(wrong);
      }
    });

    test("an example of a schema is used where the schema is", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "petMock")).toContain('name: "Pochi"');
      expect(functionBody(data, "priorityMock")).toContain("return 2;");
      expect(functionBody(data, "settingsMock")).toMatchSnapshot();
    });

    test("a value is made up to fit the constraints of the schema", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const shapes = functionBody(data, "shapesMock");
      for (const line of [
        'date: "2024-01-01",',
        'short: "str",',
        'long: "stringxx",',
        "atLeast: 5,",
        "above: 6,",
        "aboveFlag: 6,",
        "atMost: -3,",
        "below: -1,",
        "belowFlag: -1,",
        "even: 4,",
        "defaulted: 20,",
        'firstExample: "first",',
        'three: ["string", "string", "string"],',
        "none: [],",
        "pair: [1, 1],",
        'tuple: ["string", statusMock()],',
        "nullableNever: null,",
      ]) {
        expect(shapes).toContain(`    ${line}\n`);
      }
      // No value exists, so the properties are left out.
      expect(shapes).not.toContain("impossible");
      expect(shapes).not.toContain("never:");
      // What the API never returns is not in a response either.
      expect(shapes).not.toContain("writeOnly");
      expect(shapes).toContain('readOnly: "string"');
    });

    test("an example that is a value of the schema is used as it is", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "exampledMock")).toMatchSnapshot();
    });

    test("a reference to a schema that is not there is any value", async () => {
      const { data } = await mocksOfDocument({
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              responses: {
                200: {
                  description: "ok",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          gone: { $ref: "#/components/schemas/Gone" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      expect(functionBody(data, "getXResponseMock")).toContain("gone: {},");
    });

    test("what an allOf makes required cannot be cut", async () => {
      const { data, warnings } = await mocksOfDocument({
        components: {
          schemas: {
            Child: {
              allOf: [
                { $ref: "#/components/schemas/Base" },
                { required: ["child"] },
              ],
            },
            Base: {
              type: "object",
              properties: { child: { $ref: "#/components/schemas/Child" } },
            },
          },
        },
      });
      expect(functionBody(data, "childMock")).toContain(
        "return {} as unknown as Types.Child;",
      );
      expect(warnings[0]).toContain("  - Child");
    });

    test("a number is inside both bounds and a multiple of its step", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const shapes = functionBody(data, "shapesMock");
      for (const line of [
        // Half of an interval that is open at one end
        "halfOpen: 0.25,",
        "betweenOpen: 2.5,",
        "between: 2,",
        // The multiple inside the range, not the next one up
        "negativeEven: -4,",
        "tenths: 0.3,",
        "openSteps: 3,",
        "openStepsBelow: -3,",
        // An exclusive bound looser than the inclusive one changes nothing
        "looserExclusive: 5,",
        // No multiple is in the range
        "noMultiple: 2,",
        // An integer that is a multiple of a fraction is still an integer
        "wholeOfFraction: 3,",
        // However small the fraction is, or however far the whole number
        "smallFraction: 3,",
        "farWholeMultiple: 62831853,",
        "exponentFraction: 1,",
        "tinyFraction: 3,",
        "everyInteger: 1,",
        // The whole number is too large to hold, so at least an integer
        "noWholeMultiple: 1,",
        // Rounding the dust away must not leave the range
        "bigTenths: 170000000000.1,",
        // A whole step is not rounded to a few digits
        "bigInteger: 1700000000001,",
      ]) {
        expect(shapes).toContain(`    ${line}\n`);
      }
    });

    test("a property several allOf members declare is a value of all of them", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const shapes = functionBody(data, "shapesMock");
      expect(shapes).toContain(
        '    overlap: {\n      a: {\n        x: "string",\n        y: 1,\n      },\n    },',
      );
      // Also when one of the declarations is in a referenced schema.
      expect(functionBody(data, "moreMetaMock")).toContain(
        '    ...withMetaMock(),\n    meta: {\n      x: "string",\n      y: 1,\n    },',
      );
      // No value of `k` is both, and it may be absent: it is left out.
      expect(shapes).toContain("    conflicting: {},\n");
      // The same schema twice is spread once.
      expect(shapes).toContain(
        '    petPlus: {\n      ...dogMock(),\n      extra: "string",\n    },',
      );
    });

    test("an optional property no value fits is taken out, a required one ends the object", async () => {
      const { data, warnings } = await mocksOf("mocks.yaml");
      // `k` and "odd key" come with ClashA's mock and are taken out of it.
      // The rest of the object stays, with what it requires.
      expect(functionBody(data, "clashMock")).toContain(
        '    ...(({ k: _0, "odd key": _1, ...rest }) => rest)(clashAMock()),\n    ...clashBMock(),\n    id: 1,\n    ...overrides,',
      );
      expect(warnings.join("\n")).not.toContain("Clash");
      // Required, so there is no object at all.
      expect(functionBody(data, "shapesMock")).not.toContain("requiredClash");
    });

    test("an intersection that limits the values takes one every member allows", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const shapes = functionBody(data, "shapesMock");
      expect(shapes).toContain('    stringAndOk: "ok",\n');
      expect(shapes).toContain('    okAndString: "ok",\n');
      expect(shapes).toContain('    statusAndSold: "sold",\n');
      expect(shapes).toContain('    statusAndText: "available",\n');
      expect(shapes).not.toContain("noCommon");
      expect(shapes).not.toContain("statusAndPriority");

      // A literal is not a value of a TypeScript enum and of something else
      // that limits the values.
      const enums = await mocksOf("mocks.yaml", { enums: "typescript" });
      const typed = functionBody(enums.data, "shapesMock");
      expect(typed).toContain(
        '    statusAndText: ("available" as Types.Status),\n',
      );
      expect(typed).not.toContain("statusAndSold");
      expect(typed).not.toContain("statusAndPriority");
    });

    test("an intersection of types takes the value of a member that fits all", async () => {
      const { data } = await mocksOf("mocks.yaml");
      const shapes = functionBody(data, "shapesMock");
      // `string & number` has no value.
      expect(shapes).not.toContain("stringAndNumber");
      // `(string | number) & number`: the second member's value, not "string".
      expect(shapes).toContain("    numberOfEither: 1,\n");
      // `(string | null) & (number | null)` is `null`.
      expect(shapes).toContain("    nullOfBoth: null,\n");
      // A number, but neither member's own value is known to be one.
      expect(shapes).not.toContain("numberOfNeither");
    });

    test("a reference that only leads back to itself limits nothing", async () => {
      const { data } = await mocksOfDocument({
        components: {
          schemas: {
            Loop: { allOf: [{ $ref: "#/components/schemas/Loop" }] },
            Holder: {
              type: "object",
              properties: {
                value: {
                  allOf: [
                    { type: "string" },
                    { allOf: [true, { $ref: "#/components/schemas/Loop" }] },
                  ],
                },
              },
            },
          },
        },
      });
      expect(functionBody(data, "holderMock")).toContain('value: "string",');
    });

    test("an example is not taken for a wrapper that requires more", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "shapesMock")).toContain(
        "    wrapperRequired: {\n      ...dogMock(),\n      goodBoy: true,\n    },",
      );
    });

    test("dates are Date objects when the types say so", async () => {
      const { data } = await mocksOf("mocks.yaml", { useDateType: true });
      expect(functionBody(data, "petMock")).toContain(
        'bornAt: new Date("2024-01-01T00:00:00.000Z"),',
      );
      expect(functionBody(data, "listPetsResponseMock")).toContain(
        'bornAt: new Date("2020-05-17T09:00:00Z"),',
      );
      // Not a date, so the example is passed over.
      expect(functionBody(data, "driftedMock")).toContain(
        'when: new Date("2024-01-01T00:00:00.000Z"),',
      );
    });

    test("a literal of a TypeScript enum is asserted to it", async () => {
      const { data } = await mocksOf("mocks.yaml", { enums: "typescript" });
      expect(functionBody(data, "statusMock")).toContain(
        'return "available" as Types.Status;',
      );
      expect(functionBody(data, "listPetsResponseMock")).toContain(
        'status: ("sold" as Types.Status),',
      );
      const plain = await mocksOf("mocks.yaml", { enums: "javascript" });
      expect(functionBody(plain.data, "statusMock")).toContain(
        'return "available";',
      );
    });

    test("a discriminator's value goes with the member it stands for", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "animalMock")).toContain(
        '    ...catMock(),\n    kind: "cat",',
      );
      // A subtype names itself, and what it makes required is written out.
      expect(functionBody(data, "sportsCarMock")).toContain(
        '    ...carMock(),\n    doors: 0,\n    turbo: true,\n    type: "SportsCar",\n    ...overrides,',
      );
    });

    test("only one object type takes overrides", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(data).toContain(
        "export function petMock(overrides?: Partial<Types.Pet>): Types.Pet {",
      );
      expect(data).toContain("export function animalMock(): Types.Animal {");
      expect(data).toContain("export function statusMock(): Types.Status {");
      expect(data).toContain("export function maybeMock(): Types.Maybe {");
    });

    test("an alias of an object spreads what it stands for", async () => {
      const { data } = await mocksOfDocument({
        components: {
          schemas: {
            Base: { type: "object", properties: { id: { type: "integer" } } },
            Alias: { allOf: [{ $ref: "#/components/schemas/Base" }] },
            Nothing: { type: "object" },
          },
        },
      });
      expect(functionBody(data, "aliasMock")).toContain(
        "  return {\n    ...baseMock(),\n    ...overrides,\n  };",
      );
      expect(functionBody(data, "nothingMock")).toContain(
        "  return {\n    ...overrides,\n  };",
      );
    });

    test("an example can hold a key that would set the prototype", async () => {
      const { data } = await mocksOfDocument({
        components: {
          schemas: {
            Loose: {
              type: "object",
              example: JSON.parse('{"__proto__": 1, "odd key": [{"a": null}]}'),
            },
          },
        },
      });
      const body = functionBody(data, "looseMock");
      expect(body).toContain('["__proto__"]: 1,');
      expect(body).toContain('"odd key": [');
    });
  });

  describe("schemas that hold themselves", () => {
    test("a reference back is cut where the schema allows", async () => {
      const { data } = await mocksOf("mocks.yaml");
      // Pet is built first, so the owner's pets are the cut.
      expect(functionBody(data, "petMock")).toContain("owner: ownerMock(),");
      const owner = functionBody(data, "ownerMock");
      expect(owner).toContain("pets: [],");
      expect(owner).toContain("partner: null,");
      expect(owner).not.toContain("bestFriend");
      expect(functionBody(data, "maybeMock")).toContain("return null;");
    });

    test("a schema that requires itself gets an empty object and a warning", async () => {
      const { data, warnings } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "nodeMock")).toContain(
        "return {} as unknown as Types.Node;",
      );
      expect(warnings).toContainEqual(
        expect.stringMatching(
          /no value can be written[\s\S]*\n {2}- Node\n {2}- Ring$/,
        ),
      );
    });

    test("a schema cut under another one is built again on its own", async () => {
      const { data, warnings } = await mocksOfDocument({
        components: {
          schemas: {
            A: {
              type: "object",
              properties: { b: { $ref: "#/components/schemas/B" } },
            },
            B: {
              type: "object",
              required: ["a"],
              properties: { a: { $ref: "#/components/schemas/A" } },
            },
          },
        },
      });
      // Under A, B cannot leave `a` out, so A goes without it.
      expect(functionBody(data, "aMock")).not.toContain("bMock()");
      expect(functionBody(data, "bMock")).toContain("a: aMock(),");
      expect(warnings).toEqual([]);
    });

    test("gives up on schemas that all require each other", async () => {
      const keys = ["A", "B", "C", "D", "E"];
      const { data, warnings } = await mocksOfDocument({
        components: {
          schemas: Object.fromEntries(
            keys.map((key) => {
              const others = keys.filter((other) => other !== key);
              return [
                key,
                {
                  type: "object",
                  required: others,
                  properties: Object.fromEntries(
                    others.map((other) => [
                      other,
                      { $ref: `#/components/schemas/${other}` },
                    ]),
                  ),
                },
              ];
            }),
          ),
        },
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("  - A");
      for (const key of keys) {
        expect(data).toContain(`export function ${key.toLowerCase()}Mock(`);
      }
    });
  });

  describe("handlers", () => {
    test("a fixed path comes before a parameter in its place", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      const list = handlers.slice(handlers.indexOf("export const handlers"));
      expect(list.indexOf("listMyPetsHandler()")).toBeLessThan(
        list.indexOf("getPetHandler()"),
      );
      // A parameter with text around it is tighter than one alone.
      expect(list.indexOf("archivePetHandler()")).toBeLessThan(
        list.indexOf("deletePetHandler()"),
      );
      // Paths that do not compete keep the order of the specification.
      expect(list.indexOf("listPetsHandler()")).toBeLessThan(
        list.indexOf("listAnimalsHandler()"),
      );
    });

    test("path parameters become MSW parameters under any base URL", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      expect(handlers).toContain('"*/pets/:pet_id"');
      expect(handlers).toContain('"*/pets/mine"');
      // A name MSW would not read as one parameter is made into one.
      expect(handlers).toContain('"*/tags/:_1st/"');
    });

    test("a path with MSW's own syntax in it is matched by a regular expression", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      expect(handlers).toContain(
        'http.get(\n    new RegExp("/pets:count/?$"),\n',
      );
      // The path ends with a slash, so the request has to as well.
      expect(handlers).toContain(
        String.raw`new RegExp("/files/([^/]+)\\.\\(json\\|yaml\\)/$")`,
      );
    });

    test("a parameter followed by another or by letters is matched by a regular expression", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      // MSW 2 rejects `:name:extension`, and `:majorbeta` would be one name.
      expect(handlers).toContain('new RegExp("/archives/([^/]+)([^/]+)/?$")');
      expect(handlers).toContain('new RegExp("/v([^/]+)beta/ping/?$")');
      expect(handlers).not.toContain(":name:extension");
    });

    test("fixed text is matched as a request carries it", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      expect(handlers).toContain('new RegExp("/caf%C3%A9/([^/]+)/?$")');
      const encoded = await mocksOfDocument({
        paths: {
          "/a b/%41%/x^y": {
            get: { responses: { 204: { description: "ok" } } },
          },
          "/lone\ud800/surrogate": {
            get: { responses: { 204: { description: "ok" } } },
          },
        },
      });
      // What is encoded already stays, and a lone `%` is not encoded again.
      // URL parsers differ on `^`, so both spellings match.
      expect(encoded.handlers).toContain(
        String.raw`new RegExp("/a%20b/%41%/x(?:\\^|%5E)y/?$")`,
      );
      expect(encoded.handlers).toContain(
        'new RegExp("/lone%EF%BF%BD/surrogate/?$")',
      );
    });

    test("answers with the lowest successful status", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      expect(handlers).toContain(
        "answer(override, mocks.createPetResponseMock, json(201))",
      );
      // A range and `default` are answered with 200.
      expect(handlers).toContain(
        "answer(override, mocks.listMyPetsResponseMock, json(200))",
      );
      expect(handlers).toContain(
        'override?: Types.ListAnimalsResponses["default"] | HttpResponseResolver',
      );
    });

    test("a range of statuses comes after the statuses it stands for", async () => {
      const { data, handlers } = await mocksOf("mocks.yaml");
      expect(handlers).toContain(
        "answer(override, mocks.getRangedResponseMock, json(206))",
      );
      expect(data).toContain(
        "export function getRangedResponseMock(): Types.GetRangedResponses[206] {",
      );
    });

    test("a body no value can be written for is an empty object", async () => {
      const { data } = await mocksOf("mocks.yaml");
      expect(functionBody(data, "getImpossibleResponseMock")).toContain(
        "return {} as unknown as Types.GetImpossibleResponses[200];",
      );
    });

    test("answers text as text", async () => {
      const { handlers } = await mocksOf("mocks.yaml");
      expect(handlers).toContain(
        "answer(override, mocks.getStatusResponseMock, text(200))",
      );
    });

    test("answers without a body where there is none to mock", async () => {
      const { data, handlers } = await mocksOf("mocks.yaml");
      for (const [name, call] of [
        ["deletePet", 'http.delete("*/pets/:pet_id", override ?? empty(204))'],
        ["headPets", 'http.head("*/pets", override ?? empty(200))'],
        ["exportPets", 'http.get("*/export", override ?? empty(200))'],
        ["getAnything", 'http.get("*/anything", override ?? empty(200))'],
        ["getNothing", 'http.get("*/nothing", override ?? empty(200))'],
      ]) {
        expect(handlers).toContain(
          `export const ${name}Handler = (override?: HttpResponseResolver) =>\n  ${call};`,
        );
        expect(data).not.toContain(`${name}ResponseMock`);
      }
    });

    test("leaves out a method MSW has no handler for, with a warning", async () => {
      const { handlers, warnings } = await mocksOf("mocks.yaml");
      expect(handlers).not.toContain("tracePets");
      expect(warnings).toContainEqual(
        expect.stringMatching(/no handler[\s\S]*\n {2}- TRACE \/pets$/),
      );
    });

    test("only declares the helpers it uses", async () => {
      const { handlers } = await mocksOfDocument({
        paths: {
          "/ping": { get: { responses: { 204: { description: "ok" } } } },
        },
      });
      expect(handlers).toContain("const empty =");
      expect(handlers).not.toContain("const answer");
      expect(handlers).not.toContain("const json");
      expect(handlers).not.toContain("import * as mocks");
      expect(handlers).not.toContain("import type * as Types");
    });

    test("a mock name taken by a schema's mock gets a number", async () => {
      const { data, handlers } = await mocksOfDocument({
        paths: {
          "/pets": {
            get: {
              operationId: "listPets",
              responses: {
                200: {
                  description: "ok",
                  content: {
                    "application/json": { schema: { type: "string" } },
                  },
                },
              },
            },
          },
        },
        components: { schemas: { ListPetsResponse: { type: "string" } } },
      });
      expect(data).toContain("export function listPetsResponseMock(): Types.");
      expect(data).toContain("export function listPetsResponseMock2(): Types.");
      expect(handlers).toContain("mocks.listPetsResponseMock2");
    });
  });
});
