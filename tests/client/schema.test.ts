import { describe, expect, test } from "vitest";
import {
  componentSchemaKey,
  docComment,
  renderSchema,
  type SchemaCtx,
} from "../../src/client/schema.mts";

const doc = {
  components: {
    schemas: {
      Pet: { type: "object" },
      "my-odd": { type: "string" },
    },
    parameters: { Page: { schema: { type: "integer" } } },
  },
};
const ctx: SchemaCtx = {
  doc,
  names: new Map([
    ["Pet", "Pet"],
    ["my-odd", "MyOdd"],
  ]),
};
const render = (schema: unknown) => renderSchema(schema, ctx);

describe("componentSchemaKey", () => {
  test("extracts the key of a component schema ref", () => {
    expect(componentSchemaKey("#/components/schemas/Pet")).toBe("Pet");
    expect(componentSchemaKey("#/components/schemas/a~1b")).toBe("a/b");
    expect(componentSchemaKey("#/components/parameters/Page")).toBeUndefined();
    expect(
      componentSchemaKey("#/components/schemas/Pet/properties/id"),
    ).toBeUndefined();
  });
});

describe("docComment", () => {
  test("renders descriptions and @deprecated", () => {
    expect(docComment({})).toBe("");
    expect(docComment({ description: "hi" })).toBe("/**\n * hi\n */\n");
    expect(docComment({ deprecated: true }, "  ")).toBe(
      "  /**\n   * @deprecated\n   */\n",
    );
    expect(docComment({ description: "a\n\nb */", deprecated: true })).toBe(
      "/**\n * a\n *\n * b *\\/\n *\n * @deprecated\n */\n",
    );
  });
});

describe("renderSchema", () => {
  test("primitives", () => {
    expect(render({ type: "string" })).toBe("string");
    expect(render({ type: "string", format: "binary" })).toBe("Blob | File");
    expect(render({ type: "integer" })).toBe("number");
    expect(render({ type: "number" })).toBe("number");
    expect(render({ type: "boolean" })).toBe("boolean");
    expect(render({ type: "null" })).toBe("null");
  });

  test("unknown shapes", () => {
    expect(render(undefined)).toBe("unknown");
    expect(render(null)).toBe("unknown");
    expect(render(true)).toBe("unknown");
    expect(render({})).toBe("unknown");
    expect(render("nope")).toBe("unknown");
    expect(render(false)).toBe("never");
  });

  test("component refs use the generated name, falling back to toTypeName", () => {
    expect(render({ $ref: "#/components/schemas/my-odd" })).toBe("MyOdd");
    expect(render({ $ref: "#/components/schemas/unknown-one" })).toBe(
      "UnknownOne",
    );
  });

  test("other refs are inlined and cycles collapse to unknown", () => {
    expect(render({ $ref: "#/components/parameters/Page/schema" })).toBe(
      "number",
    );
    const cyclic: SchemaCtx = {
      doc: { a: { $ref: "#/a" } },
      names: new Map(),
    };
    expect(renderSchema({ $ref: "#/a" }, cyclic)).toBe("unknown");
  });

  test("enum and const", () => {
    expect(render({ enum: ["a", 1, true, null] })).toBe(
      '"a" | 1 | true | null',
    );
    expect(render({ type: "string", enum: ["a"], nullable: true })).toBe(
      '"a" | null',
    );
    expect(render({ enum: [null], nullable: true })).toBe("null");
    expect(render({ enum: [{ x: 1 }] })).toBe("unknown");
    expect(render({ const: "x" })).toBe('"x"');
    expect(render({ const: 3, nullable: true })).toBe("3 | null");
  });

  test("nullable in both OpenAPI dialects", () => {
    expect(render({ type: "string", nullable: true })).toBe("string | null");
    expect(render({ type: ["string", "null"] })).toBe("string | null");
    expect(render({ type: ["string", "integer"] })).toBe("string | number");
    expect(render({ type: "null", nullable: true })).toBe("null");
  });

  test("arrays and tuples", () => {
    expect(render({ type: "array", items: { type: "string" } })).toBe(
      "Array<string>",
    );
    expect(render({ type: "array" })).toBe("Array<unknown>");
    expect(
      render({ prefixItems: [{ type: "string" }, { type: "number" }] }),
    ).toBe("[string, number]");
    expect(
      render({
        type: "array",
        prefixItems: [{ type: "string" }],
        items: { type: "boolean" },
      }),
    ).toBe("[string, ...Array<boolean>]");
    expect(
      render({
        type: "array",
        prefixItems: [{ type: "string" }],
        items: false,
      }),
    ).toBe("[string]");
    expect(render({ items: { type: "string" } })).toBe("Array<string>");
  });

  test("objects", () => {
    expect(
      render({
        type: "object",
        required: ["a"],
        properties: {
          a: { type: "string", description: "The a" },
          "b-c": { type: "integer", deprecated: true },
        },
      }),
    ).toBe(
      '{\n  /**\n   * The a\n   */\n  a: string;\n  /**\n   * @deprecated\n   */\n  "b-c"?: number;\n}',
    );
    expect(render({ type: "object" })).toBe("{\n  [key: string]: unknown;\n}");
    expect(render({ type: "object", additionalProperties: false })).toBe("{}");
    expect(
      render({ type: "object", additionalProperties: { type: "string" } }),
    ).toBe("{\n  [key: string]: string;\n}");
    expect(render({ type: "object", additionalProperties: {} })).toBe(
      "{\n  [key: string]: unknown;\n}",
    );
    expect(render({ properties: { a: { type: "string" } } })).toBe(
      "{\n  a?: string;\n}",
    );
  });

  test("index signatures cover the declared properties", () => {
    expect(
      render({
        type: "object",
        required: ["a"],
        properties: { a: { type: "number" }, b: { type: "string" } },
        additionalProperties: { type: "boolean" },
      }),
    ).toContain("[key: string]: boolean | number | string | undefined;");
    expect(
      render({
        type: "object",
        properties: { a: { type: "number" } },
        additionalProperties: true,
      }),
    ).toContain("[key: string]: unknown;");
  });

  test("nested objects are indented", () => {
    expect(
      render({
        type: "object",
        properties: {
          inner: { type: "object", properties: { x: { type: "string" } } },
        },
      }),
    ).toBe("{\n  inner?: {\n    x?: string;\n  };\n}");
  });

  test("allOf builds an intersection", () => {
    expect(
      render({
        allOf: [
          { $ref: "#/components/schemas/Pet" },
          {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
          },
        ],
      }),
    ).toBe("Pet & {\n  id: string;\n}");
    expect(
      render({
        allOf: [{ $ref: "#/components/schemas/Pet" }],
        properties: { x: { type: "string" } },
      }),
    ).toBe("Pet & {\n  x?: string;\n}");
    expect(
      render({
        allOf: [
          { oneOf: [{ type: "string" }, { type: "number" }] },
          { $ref: "#/components/schemas/Pet" },
        ],
        nullable: true,
      }),
    ).toBe("(string | number) & Pet | null");
    expect(render({ allOf: [{}] })).toBe("unknown");
  });

  test("oneOf and anyOf build unions", () => {
    expect(render({ oneOf: [{ type: "string" }, { type: "number" }] })).toBe(
      "string | number",
    );
    expect(render({ anyOf: [{ type: "string" }, { type: "string" }] })).toBe(
      "string",
    );
    expect(render({ oneOf: [{ type: "string" }, {}] })).toBe("unknown");
    expect(
      render({
        oneOf: [{ type: "string" }, { type: "number" }],
        properties: { x: { type: "string" } },
      }),
    ).toBe("(string | number) & {\n  x?: string;\n}");
    expect(render({ oneOf: [{ type: "string" }], nullable: true })).toBe(
      "string | null",
    );
  });

  test("union() of nothing is never", () => {
    expect(render({ type: [] })).toBe("never");
  });

  test("quotes and brackets inside literals do not confuse parenthesisation", () => {
    expect(
      render({
        allOf: [
          { enum: ["a|b", 'c"|d'] },
          { $ref: "#/components/schemas/Pet" },
        ],
      }),
    ).toBe('("a|b" | "c\\"|d") & Pet');
    expect(
      render({
        allOf: [
          {
            type: "array",
            items: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
          { $ref: "#/components/schemas/Pet" },
        ],
      }),
    ).toBe("Array<string | number> & Pet");
  });
});
