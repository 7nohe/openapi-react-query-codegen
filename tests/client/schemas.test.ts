// `schemas.gen.ts`: the component schemas as constants, named and split into
// what the API returns and what it takes the way v3 did.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  generateClient,
  writeGeneratedFiles,
} from "../../src/client/index.mts";
import { generateTestClient, inputPath } from "../utils";

const file = (
  generated: { files: { name: string; content: string }[] },
  name: string,
) => generated.files.find((f) => f.name === name)?.content;

const inline = (
  schemas: Record<string, unknown>,
  mode: "json" | "form" | false = "json",
) =>
  generateClient({
    input: JSON.stringify({
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {},
      components: { schemas },
    }),
    client: "fetch",
    importExtension: "",
    pageParam: "page",
    schemas: mode,
  });

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(__dirname, "schemas-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The constants a generated `schemas.gen.ts` exports. */
const load = async (
  name: string,
  generated: Awaited<ReturnType<typeof generateClient>>,
): Promise<Record<string, unknown>> => {
  const out = path.join(dir, name);
  await writeGeneratedFiles(out, generated.files);
  return { ...(await import(path.join(out, "schemas.gen.ts"))) };
};

describe("schemas.gen.ts", () => {
  test("is not generated unless asked for", async () => {
    expect(
      file(await generateTestClient("features.yaml"), "schemas.gen.ts"),
    ).toBeUndefined();
    expect(
      file(await inline({ A: { type: "string" } }, false), "schemas.gen.ts"),
    ).toBeUndefined();
    expect(file(await inline({}), "schemas.gen.ts")).toBeUndefined();
  });

  test("features fixture", async () => {
    const generated = await generateTestClient("features.yaml", {
      schemas: "json",
    });
    expect(file(generated, "schemas.gen.ts")).toMatchSnapshot();
    expect(generated.files.map((f) => f.name).at(-1)).toBe("schemas.gen.ts");
  });

  test("holds the schemas as the specification writes them", async () => {
    const generated = await generateTestClient("petstore.yaml", {
      schemas: "json",
    });
    const spec = parse(await readFile(inputPath("petstore.yaml"), "utf-8"));
    const expected = Object.fromEntries(
      Object.entries(spec.components.schemas).map(([key, schema]) => [
        `${key}Schema`,
        schema,
      ]),
    );
    expect(await load("petstore", generated)).toEqual(expected);
  });

  test("form leaves out what only documents a schema", async () => {
    const schemas = {
      Status: {
        type: "string",
        title: "Status",
        description: "How it is going",
        enum: ["a"],
        "x-enum-varnames": ["A"],
        "x-enumNames": ["A"],
        "x-enum-descriptions": ["The first"],
      },
      Item: {
        type: "object",
        description: "An item",
        properties: {
          // Properties with the names of keywords are properties.
          description: { type: "string", description: "Free text" },
          title: { type: "string", maxLength: 10 },
          tags: {
            type: "array",
            items: { type: "string", description: "A tag" },
          },
        },
      },
    };
    expect(await load("form", await inline(schemas, "form"))).toEqual({
      StatusSchema: { type: "string", enum: ["a"] },
      ItemSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          title: { type: "string", maxLength: 10 },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    });
    expect(await load("json", await inline(schemas))).toEqual({
      StatusSchema: schemas.Status,
      ItemSchema: schemas.Item,
    });
  });

  test("names follow the schema keys", async () => {
    const constants = await load(
      "names",
      await inline({
        account_annual_revenue: { type: "number" },
        "my-schema": { type: "number" },
        "Zoo.Cat": { type: "number" },
        "weird name/with~stuff": { type: "number" },
        "1abc": { type: "number" },
        // These two would otherwise get the same name.
        "a-b": { const: 1 },
        a_b: { const: 2 },
        Pet: { type: "number" },
        PetSchema: { type: "number" },
      }),
    );
    expect(Object.keys(constants).sort()).toEqual([
      "PetSchema",
      "PetSchemaSchema",
      "Zoo_CatSchema",
      "_1abcSchema",
      "a_bSchema",
      "a_bSchema2",
      "account_annual_revenueSchema",
      "my_schemaSchema",
      "weird_name_with_stuffSchema",
    ]);
    expect(constants.a_bSchema).toEqual({ const: 1 });
    expect(constants.a_bSchema2).toEqual({ const: 2 });
  });

  test("readOnly and writeOnly properties split a schema in two", async () => {
    const constants = await load(
      "sides",
      await inline({
        User: {
          type: "object",
          required: ["id", "password", "name"],
          properties: {
            id: { type: "string", readOnly: true },
            password: { type: "string", writeOnly: true },
            name: { type: "string" },
            nested: {
              type: "object",
              required: ["seen"],
              properties: {
                secret: { type: "string", writeOnly: true },
                seen: { type: "string", readOnly: true },
              },
            },
          },
        },
        Team: {
          type: "object",
          properties: {
            members: {
              type: "array",
              items: { $ref: "#/components/schemas/User" },
            },
            lead: {
              oneOf: [
                { $ref: "#/components/schemas/User" },
                { $ref: "#/components/schemas/Unrelated" },
              ],
            },
          },
        },
        Unrelated: { type: "string" },
      }),
    );
    expect(Object.keys(constants)).toEqual([
      "UserSchema",
      "TeamSchema",
      "UnrelatedSchema",
      "UserWritableSchema",
      "TeamWritableSchema",
    ]);
    expect(constants.UserSchema).toEqual({
      type: "object",
      required: ["id", "name"],
      properties: {
        id: { type: "string", readOnly: true },
        name: { type: "string" },
        nested: {
          type: "object",
          required: ["seen"],
          properties: { seen: { type: "string", readOnly: true } },
        },
      },
    });
    expect(constants.UserWritableSchema).toEqual({
      type: "object",
      required: ["password", "name"],
      properties: {
        password: { type: "string", writeOnly: true },
        name: { type: "string" },
        nested: {
          type: "object",
          properties: { secret: { type: "string", writeOnly: true } },
        },
      },
    });
    expect(constants.TeamWritableSchema).toEqual({
      type: "object",
      properties: {
        members: {
          type: "array",
          items: { $ref: "#/components/schemas/UserWritable" },
        },
        lead: {
          oneOf: [
            { $ref: "#/components/schemas/UserWritable" },
            { $ref: "#/components/schemas/Unrelated" },
          ],
        },
      },
    });
  });

  test("values that are not schemas are kept as they are", async () => {
    const schemas = {
      Odd: {
        type: "object",
        additionalProperties: false,
        default: {
          properties: { a: { writeOnly: true } },
          list: [],
          empty: {},
        },
        example: null,
        minimum: -1.5,
        nullable: true,
        patternProperties: { "^x-": { type: "string" } },
        prefixItems: [{ type: "string" }],
        not: { type: "null" },
        properties: { "needs quotes": { type: "boolean" } },
      },
    };
    const constants = await load("odd", await inline(schemas));
    expect(constants.OddSchema).toEqual(schemas.Odd);
  });
});
