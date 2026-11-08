import { describe, expect, test } from "vitest";
import {
  componentSchemaKey,
  docComment,
  findReadWriteOnlyKeys,
  renderSchema,
  type SchemaCtx,
  schemaDescription,
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
    // `nullable` does not widen an enum; null has to be listed (OpenAPI 3.0.3).
    expect(render({ type: "string", enum: ["a"], nullable: true })).toBe('"a"');
    expect(render({ type: "string", enum: ["a", null], nullable: true })).toBe(
      '"a" | null',
    );
    expect(render({ enum: [null] })).toBe("null");
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
    expect(
      render({
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: { type: "string" },
        },
      }),
    ).toBe("[[string], [string]]");
    expect(
      render({
        type: "array",
        minItems: 0,
        maxItems: 0,
        items: { type: "string" },
      }),
    ).toBe("Array<string>");
    expect(
      render({
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: { type: "string" },
      }),
    ).toBe("Array<string>");
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

describe("readOnly / writeOnly", () => {
  const schema = {
    type: "object",
    required: ["id", "name", "secret"],
    properties: {
      id: { type: "integer", readOnly: true },
      name: { type: "string" },
      secret: { type: "string", writeOnly: true },
      child: { $ref: "#/components/schemas/Pet" },
    },
  };
  const rwCtx: SchemaCtx = {
    doc,
    names: new Map([["Pet", "Pet"]]),
    writableNames: new Map([["Pet", "PetWritable"]]),
  };

  test("responses mark readOnly properties readonly and drop writeOnly ones", () => {
    expect(renderSchema(schema, rwCtx)).toBe(
      "{\n  readonly id: number;\n  name: string;\n  child?: Pet;\n}",
    );
  });

  test("requests drop readOnly properties and use the writable variants", () => {
    const used = new Set<string>();
    expect(
      renderSchema(schema, { ...rwCtx, mode: "write", usedWritable: used }),
    ).toBe("{\n  name: string;\n  secret: string;\n  child?: PetWritable;\n}");
    expect([...used]).toEqual(["Pet"]);
    expect(
      renderSchema(
        { $ref: "#/components/schemas/Pet" },
        { ...rwCtx, mode: "write" },
      ),
    ).toBe("PetWritable");
  });

  test("an object whose properties are all filtered out stays empty", () => {
    expect(
      renderSchema(
        {
          type: "object",
          properties: { id: { type: "integer", readOnly: true } },
        },
        { ...rwCtx, mode: "write" },
      ),
    ).toBe("{}");
  });
});

describe("findReadWriteOnlyKeys", () => {
  test("follows references transitively and tolerates cycles", () => {
    const keys = findReadWriteOnlyKeys({
      components: {
        schemas: {
          Direct: {
            type: "object",
            properties: { id: { readOnly: true, type: "string" } },
          },
          Wrapper: { allOf: [{ $ref: "#/components/schemas/Direct" }] },
          List: {
            type: "array",
            items: { $ref: "#/components/schemas/Wrapper" },
          },
          Map: { additionalProperties: { $ref: "#/components/schemas/List" } },
          Tuple: { prefixItems: [{ $ref: "#/components/schemas/Direct" }] },
          Loop: {
            type: "object",
            properties: { self: { $ref: "#/components/schemas/Loop" } },
          },
          Plain: { type: "object", properties: { a: { type: "string" } } },
          Nested: {
            type: "object",
            properties: {
              x: {
                type: "object",
                properties: { secret: { writeOnly: true } },
              },
            },
          },
        },
      },
    });
    expect([...keys].sort()).toEqual([
      "Direct",
      "List",
      "Map",
      "Nested",
      "Tuple",
      "Wrapper",
    ]);
    expect(findReadWriteOnlyKeys({}).size).toBe(0);
  });
});

describe("discriminated unions", () => {
  const discDoc = {
    components: {
      schemas: {
        Cat: { type: "object", properties: { kind: { type: "string" } } },
        Dog: { type: "object", properties: { kind: { type: "string" } } },
        Bird: {
          type: "object",
          properties: { kind: { type: "string", enum: ["bird"] } },
        },
        Fish: { allOf: [{ $ref: "#/components/schemas/Bird" }] },
        Shared: {
          type: "object",
          properties: { kind: { $ref: "#/components/schemas/Kind" } },
        },
        Kind: { type: "string", enum: ["shared"] },
        Plain: { type: "object", properties: { x: { type: "string" } } },
        Const: { type: "object", properties: { kind: { const: "c" } } },
      },
    },
  };
  const discCtx: SchemaCtx = {
    doc: discDoc,
    names: new Map(
      Object.keys(discDoc.components.schemas).map((key) => [key, key]),
    ),
  };
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

  test("adds the discriminator literal to members that do not pin it", () => {
    expect(
      renderSchema(
        {
          oneOf: [ref("Cat"), ref("Dog")],
          discriminator: { propertyName: "kind" },
        },
        discCtx,
      ),
    ).toBe('({ kind: "Cat" } & Cat) | ({ kind: "Dog" } & Dog)');
  });

  test("honours the mapping, including several values for one member", () => {
    expect(
      renderSchema(
        {
          anyOf: [ref("Cat"), ref("Dog")],
          discriminator: {
            propertyName: "kind",
            mapping: {
              feline: "#/components/schemas/Cat",
              kitten: "Cat",
              canine: "#/components/schemas/Dog",
            },
          },
        },
        discCtx,
      ),
    ).toBe(
      '({ kind: "feline" | "kitten" } & Cat) | ({ kind: "canine" } & Dog)',
    );
  });

  test("leaves members that already pin the property, and non-ref members, alone", () => {
    expect(
      renderSchema(
        {
          oneOf: [
            ref("Bird"),
            ref("Fish"),
            ref("Shared"),
            ref("Const"),
            { type: "string" },
          ],
          discriminator: { propertyName: "kind" },
        },
        discCtx,
      ),
    ).toBe("Bird | Fish | Shared | Const | string");
  });

  test("array and primitive members are not intersected", () => {
    const arrayCtx: SchemaCtx = {
      doc: {
        components: {
          schemas: {
            List: { type: "array", items: { type: "string" } },
            Cat: { type: "object", properties: { kind: { type: "string" } } },
          },
        },
      },
      names: new Map([
        ["List", "List"],
        ["Cat", "Cat"],
      ]),
    };
    expect(
      renderSchema(
        {
          oneOf: [ref("List"), ref("Cat")],
          discriminator: {
            propertyName: "kind",
            mapping: { array: "#/components/schemas/List" },
          },
        },
        arrayCtx,
      ),
    ).toBe('List | ({ kind: "Cat" } & Cat)');
  });

  test("members without the property still get the literal", () => {
    expect(
      renderSchema(
        { oneOf: [ref("Plain")], discriminator: { propertyName: "type-name" } },
        discCtx,
      ),
    ).toBe('({ "type-name": "Plain" } & Plain)');
    expect(
      renderSchema(
        {
          oneOf: [{ $ref: "#/other/Thing" }],
          discriminator: { propertyName: "k" },
        },
        {
          doc: { other: { Thing: { type: "string" } } },
          names: new Map(),
        },
      ),
    ).toBe("string");
  });
});

describe("schemaDescription", () => {
  test("combines title and description", () => {
    expect(schemaDescription({ title: "T", description: "D" })).toBe("T\n\nD");
    expect(schemaDescription({ title: "T" })).toBe("T");
    expect(schemaDescription({ description: "D" })).toBe("D");
    expect(schemaDescription({ title: "" })).toBeUndefined();
    expect(schemaDescription(undefined)).toBeUndefined();
    expect(schemaDescription("x")).toBeUndefined();
  });

  test("shows up in property and component documentation", () => {
    expect(
      renderSchema(
        {
          type: "object",
          properties: {
            a: { title: "A", description: "The a", type: "string" },
          },
        },
        { doc: {}, names: new Map() },
      ),
    ).toContain("   * A\n   *\n   * The a\n");
  });
});

describe("keywords next to a $ref", () => {
  const withVersion = (openapi: string): SchemaCtx => ({
    ...ctx,
    doc: { ...doc, openapi },
  });
  const schema = {
    $ref: "#/components/schemas/Pet",
    description: "Only documentation",
    properties: { extra: { type: "string" } },
    required: ["extra", "other"],
  };

  test("OpenAPI 3.1 applies them together with the reference", () => {
    const rendered = renderSchema(schema, withVersion("3.1.0"));
    expect(rendered).toMatch(/^Pet & \{/);
    expect(rendered).toContain("extra: string;");
    expect(rendered).toContain("other: unknown;");
  });

  test("OpenAPI 3.0 ignores them", () => {
    expect(renderSchema(schema, withVersion("3.0.3"))).toBe("Pet");
  });

  test("keywords that do not change the type stay out of it", () => {
    expect(
      renderSchema(
        {
          $ref: "#/components/schemas/Pet",
          description: "d",
          deprecated: true,
        },
        withVersion("3.1.0"),
      ),
    ).toBe("Pet");
  });

  test("a readOnly property next to a $ref needs a request-side type", () => {
    const keys = findReadWriteOnlyKeys({
      openapi: "3.1.0",
      components: {
        schemas: {
          Base: { type: "object" },
          Child: {
            $ref: "#/components/schemas/Base",
            properties: { id: { type: "string", readOnly: true } },
          },
        },
      },
    });
    expect([...keys]).toEqual(["Child"]);
  });
});

describe("global types shadowed by a schema", () => {
  test("binary strings keep meaning the globals", () => {
    const shadowing: SchemaCtx = {
      doc,
      names: new Map([
        ["Blob", "Blob"],
        ["File", "File"],
      ]),
    };
    expect(renderSchema({ type: "string", format: "binary" }, shadowing)).toBe(
      "globalThis.Blob | globalThis.File",
    );
    expect(render({ type: "string", format: "binary" })).toBe("Blob | File");
  });
});
