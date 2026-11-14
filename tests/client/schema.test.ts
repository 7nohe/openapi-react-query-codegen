import { describe, expect, test } from "vitest";
import {
  componentSchemaKey,
  docComment,
  findReadWriteOnlyKeys,
  renderComponentSchema,
  renderSchema,
  type SchemaCtx,
  schemaDescription,
  schemaKinds,
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
    expect(
      renderSchema(
        { $ref: "#/components/schemas/unnamed-one" },
        {
          doc: { components: { schemas: { "unnamed-one": {} } } },
          names: new Map(),
        },
      ),
    ).toBe("UnnamedOne");
  });

  test("a component ref to a schema that is not there is unknown", () => {
    expect(render({ $ref: "#/components/schemas/unknown-one" })).toBe(
      "unknown",
    );
    // Keys are case-sensitive, and inherited ones are not schemas.
    expect(render({ $ref: "#/components/schemas/pet" })).toBe("unknown");
    expect(render({ $ref: "#/components/schemas/toString" })).toBe("unknown");
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
    expect(renderSchema(schema, { ...rwCtx, mode: "write" })).toBe(
      "{\n  name: string;\n  secret: string;\n  child?: PetWritable;\n}",
    );
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

describe("a discriminator enum inherited by the members", () => {
  const schemas = {
    Pet: {
      type: "object",
      required: ["kind"],
      properties: { kind: { type: "string", enum: ["cat", "dog"] } },
    },
    Cat: { allOf: [{ $ref: "#/components/schemas/Pet" }] },
    Dog: { allOf: [{ $ref: "#/components/schemas/Pet" }] },
    Fish: {
      type: "object",
      properties: { kind: { type: "string", enum: ["fish"] } },
    },
  };
  const inherited: SchemaCtx = {
    doc: { openapi: "3.0.3", components: { schemas } },
    names: new Map(Object.keys(schemas).map((key) => [key, key])),
  };
  const member = (key: string) => ({ $ref: `#/components/schemas/${key}` });

  test("is narrowed by the mapping", () => {
    expect(
      renderSchema(
        {
          oneOf: [member("Cat"), member("Dog")],
          discriminator: {
            propertyName: "kind",
            mapping: {
              cat: "#/components/schemas/Cat",
              dog: "#/components/schemas/Dog",
            },
          },
        },
        inherited,
      ),
    ).toBe('({ kind: "cat" } & Cat) | ({ kind: "dog" } & Dog)');
  });

  test("stays when the name is not one of its values", () => {
    expect(
      renderSchema(
        {
          oneOf: [member("Cat"), member("Fish")],
          discriminator: { propertyName: "kind" },
        },
        inherited,
      ),
    ).toBe("Cat | Fish");
  });

  test("a single value is left alone whatever the mapping says", () => {
    expect(
      renderSchema(
        {
          oneOf: [member("Fish")],
          discriminator: {
            propertyName: "kind",
            mapping: { fish: "#/components/schemas/Fish" },
          },
        },
        inherited,
      ),
    ).toBe("Fish");
  });
});

describe("patternProperties", () => {
  test("become the index signature", () => {
    const pattern = { "^x-": { type: "number" }, "^y-": { type: "string" } };
    expect(
      render({
        type: "object",
        patternProperties: pattern,
        additionalProperties: false,
      }),
    ).toBe("{\n  [key: string]: number | string;\n}");
    expect(render({ patternProperties: { "^x-": { type: "number" } } })).toBe(
      "{\n  [key: string]: unknown;\n}",
    );
    expect([
      ...findReadWriteOnlyKeys({
        components: {
          schemas: {
            Credentials: {
              type: "object",
              patternProperties: {
                "^a": {
                  type: "object",
                  properties: {
                    password: { type: "string", writeOnly: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]).toEqual(["Credentials"]);
    expect(
      render({
        type: "object",
        properties: { a: { type: "string" } },
        patternProperties: { "^x-": { type: "number" } },
      }),
    ).toBe("{\n  a?: string;\n  [key: string]: unknown;\n}");
    expect(
      render({
        type: "object",
        patternProperties: { "^x-": { type: "number" } },
        additionalProperties: { type: "boolean" },
      }),
    ).toBe("{\n  [key: string]: number | boolean;\n}");
    expect(
      render({
        type: "object",
        patternProperties: { "^x-": { type: "number" } },
        additionalProperties: true,
      }),
    ).toBe("{\n  [key: string]: unknown;\n}");
  });
});

describe("patternProperties next to a composition", () => {
  const pattern = { "^at_": { type: "string", format: "date-time" } };
  const member = { type: "object", properties: { a: { type: "string" } } };
  const index = "{\n  [key: string]: string;\n}";

  test.each(["allOf", "anyOf", "oneOf"])(
    "%s keeps the index signature",
    (key) => {
      expect(
        render({
          [key]: [member],
          patternProperties: pattern,
          additionalProperties: false,
        }),
      ).toBe(`{\n  a?: string;\n} & ${index}`);
    },
  );
});

describe("schemaKinds", () => {
  const kindsDoc = {
    components: {
      schemas: {
        Id: { type: "integer" },
        Loop: { $ref: "#/components/schemas/Loop" },
      },
    },
  };
  const kinds = (schema: unknown) => [...schemaKinds(kindsDoc, schema)].sort();
  const all = [
    "array",
    "boolean",
    "null",
    "number",
    "object",
    "other",
    "string",
  ];

  test.each([
    [{ type: "string" }, ["string"]],
    [{ type: "integer" }, ["number"]],
    [{ type: ["string", "null"] }, ["null", "string"]],
    [{ type: "file" }, ["other"]],
    [{ $ref: "#/components/schemas/Id" }, ["number"]],
    [{ enum: ["a", 1, null, true, [], {}] }, all.filter((k) => k !== "other")],
    [{ const: "a" }, ["string"]],
    // What a schema without `type` implies by its keywords.
    [{ properties: {} }, ["object"]],
    [{ patternProperties: {} }, ["object"]],
    [{ additionalProperties: false }, ["object"]],
    [{ items: {} }, ["array"]],
    [{ prefixItems: [] }, ["array"]],
    // A composition narrows what the schema says itself.
    [{ allOf: [{ type: "integer" }] }, ["number"]],
    [{ allOf: [{ type: "integer" }, { minimum: 1 }] }, ["number"]],
    [
      { type: "string", anyOf: [{ maxLength: 1 }, { pattern: "a" }] },
      ["string"],
    ],
    [{ anyOf: [{ type: "string" }, { type: "array" }] }, ["array", "string"]],
    [{ oneOf: [{ type: "object" }, { type: "null" }] }, ["null", "object"]],
    [{ allOf: [{ type: "string" }, { type: "object" }] }, []],
    // Nothing is known.
    [{}, all],
    [true, all],
    [undefined, all],
    [{ $ref: "#/components/schemas/Loop" }, all],
    [{ $ref: "#/components/schemas/Nope" }, all],
    [false, []],
  ])("%j", (schema, expected) => {
    expect(kinds(schema)).toEqual(expected);
  });
});

describe("subtypes of a schema with a discriminator", () => {
  const schemas = {
    Pet: {
      type: "object",
      required: ["petType"],
      properties: { petType: { type: "string" } },
      discriminator: {
        propertyName: "petType",
        mapping: {
          dog: "#/components/schemas/Dog",
          hound: "#/components/schemas/Dog",
          puppy: "#/components/schemas/Puppy",
          kitty: "#/components/schemas/Cat",
        },
      },
    },
    Dog: { allOf: [{ $ref: "#/components/schemas/Pet" }] },
    Puppy: { allOf: [{ $ref: "#/components/schemas/Dog" }] },
    Lizard: { allOf: [{ $ref: "#/components/schemas/Pet" }] },
    Cat: {
      allOf: [
        { $ref: "#/components/schemas/Pet" },
        { properties: { petType: { enum: ["cat"] } } },
      ],
    },
    Base: {
      type: "object",
      properties: { kind: { type: "string" } },
      discriminator: { propertyName: "kind" },
    },
    Impl: { allOf: [{ $ref: "#/components/schemas/Base" }] },
    Owner: { type: "object", properties: { name: { type: "string" } } },
    Person: { allOf: [{ $ref: "#/components/schemas/Owner" }] },
  };
  const subtypeCtx: SchemaCtx = {
    doc: { openapi: "3.0.3", components: { schemas } },
    names: new Map(Object.keys(schemas).map((key) => [key, key])),
  };
  const emit = (key: keyof typeof schemas) =>
    renderComponentSchema(schemas[key], key, subtypeCtx);

  test("take their values from the mapping", () => {
    expect(emit("Dog")).toBe('Pet & {\n  petType: "dog" | "hound";\n}');
  });

  test("or else from their name", () => {
    expect(emit("Lizard")).toBe('Pet & {\n  petType: "Lizard";\n}');
  });

  test("replace the value of a parent that is a subtype too", () => {
    expect(emit("Puppy")).toBe(
      'Omit<Dog, "petType"> & {\n  petType: "puppy";\n}',
    );
  });

  test("keep the property optional when the parent does", () => {
    expect(emit("Impl")).toBe('Base & {\n  kind?: "Impl";\n}');
  });

  test("leave a value they pin themselves alone", () => {
    expect(emit("Cat")).toBe('Pet & {\n  petType?: "cat";\n}');
  });

  test("do not touch a schema without a discriminator", () => {
    expect(emit("Person")).toBe("Owner");
    expect(emit("Pet")).toBe("{\n  petType: string;\n}");
  });
});

describe("objects without properties", () => {
  test("a closed one only accepts an empty object, as in v3", () => {
    expect(render({ type: "object", additionalProperties: false })).toBe(
      "{ [key: string]: never }",
    );
  });

  test("an open one takes anything", () => {
    expect(render({ type: "object" })).toBe("{\n  [key: string]: unknown;\n}");
  });

  test("one whose properties are hidden stays an object type", () => {
    expect(
      renderSchema(
        {
          type: "object",
          additionalProperties: false,
          properties: { id: { type: "string", readOnly: true } },
        },
        { ...ctx, mode: "write" },
      ),
    ).toBe("{}");
  });
});

describe("readOnly and writeOnly behind a $ref", () => {
  const doc = {
    openapi: "3.0.3",
    components: {
      schemas: {
        ReadId: { type: "integer", readOnly: true },
        Secret: { type: "string", writeOnly: true },
        Pet: {
          type: "object",
          required: ["id", "secret", "name"],
          properties: {
            id: { $ref: "#/components/schemas/ReadId" },
            secret: { $ref: "#/components/schemas/Secret" },
            name: { type: "string" },
          },
        },
      },
    },
  };
  const names = new Map([
    ["ReadId", "ReadId"],
    ["Secret", "Secret"],
    ["Pet", "Pet"],
  ]);
  const pet = doc.components.schemas.Pet;

  test("need a request-side type", () => {
    expect([...findReadWriteOnlyKeys(doc)]).toEqual(["Pet"]);
  });

  test("count next to the $ref as well", () => {
    const sibling = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Id: { type: "string" },
          Entity: {
            type: "object",
            required: ["id", "name"],
            properties: {
              id: { $ref: "#/components/schemas/Id", readOnly: true },
              name: { type: "string" },
            },
          },
        },
      },
    };
    expect([...findReadWriteOnlyKeys(sibling)]).toEqual(["Entity"]);
    expect(
      renderSchema(sibling.components.schemas.Entity, {
        doc: sibling,
        names: new Map([
          ["Id", "Id"],
          ["Entity", "Entity"],
        ]),
        mode: "write",
      }),
    ).toBe("{\n  name: string;\n}");
  });

  test("are left out when writing and reading as they would be inline", () => {
    expect(renderSchema(pet, { doc, names, mode: "write" })).toBe(
      "{\n  secret: Secret;\n  name: string;\n}",
    );
    expect(renderSchema(pet, { doc, names, mode: "read" })).toBe(
      "{\n  id: ReadId;\n  name: string;\n}",
    );
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

  test("follows a reference into a schema, which the types inline", () => {
    const holder = {
      type: "object",
      properties: {
        owner: {
          type: "object",
          properties: { id: { type: "integer", readOnly: true } },
        },
        named: { $ref: "#/components/schemas/Direct" },
        plain: { type: "string" },
      },
    };
    const inner = (name: string) => ({
      $ref: `#/components/schemas/Holder/properties/${name}`,
    });
    const keys = findReadWriteOnlyKeys({
      components: {
        schemas: {
          Direct: {
            type: "object",
            properties: { id: { readOnly: true, type: "string" } },
          },
          Holder: holder,
          // The inlined schema has the property itself.
          Pet: { type: "object", properties: { owner: inner("owner") } },
          // It refers to a schema that has it.
          Named: { type: "array", items: inner("named") },
          // Through another reference of the same sort.
          Chain: {
            allOf: [{ $ref: "#/components/schemas/Pet/properties/owner" }],
          },
          Plain: { type: "object", properties: { a: inner("plain") } },
          Dangling: { type: "object", properties: { a: inner("nope") } },
          Loop: {
            type: "object",
            properties: {
              self: { $ref: "#/components/schemas/Loop/properties/self" },
            },
          },
        },
      },
    });
    expect([...keys].sort()).toEqual([
      "Chain",
      "Direct",
      "Holder",
      "Named",
      "Pet",
    ]);
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

describe("doc comments and union detection", () => {
  test.each(["don't", 'a "quote', "open { brace", "tick ` and < angle"])(
    "a description with %s keeps the union in parentheses",
    (description) => {
      const rendered = render({
        allOf: [
          {
            oneOf: [
              {
                type: "object",
                properties: { a: { type: "string", description } },
              },
              { type: "string" },
            ],
          },
          { type: "object", properties: { b: { type: "string" } } },
        ],
      });
      expect(rendered).toMatch(/^\(\{[\s\S]*\} \| string\) & \{/);
    },
  );
});

describe("properties an allOf requires", () => {
  const base = {
    type: "object",
    properties: {
      id: { type: "string", nullable: true },
      secret: { type: "string", writeOnly: true },
      stamp: { type: "string", readOnly: true },
    },
  };
  const requiredCtx = (mode: "read" | "write" = "read"): SchemaCtx => ({
    doc: { openapi: "3.0.3", components: { schemas: { Base: base } } },
    names: new Map([["Base", "Base"]]),
    mode,
  });
  const ref = { $ref: "#/components/schemas/Base" };

  test("a member that only lists names adds them with their type", () => {
    expect(
      renderSchema({ allOf: [ref, { required: ["id"] }] }, requiredCtx()),
    ).toBe("Base & {\n  id: string | null;\n}");
  });

  test("a typed member without properties adds no index signature", () => {
    const rendered = renderSchema(
      { allOf: [ref, { type: "object", required: ["id"] }] },
      requiredCtx(),
    );
    expect(rendered).toBe("Base & {\n  id: string | null;\n}");
  });

  test("the schema's own list counts as well", () => {
    expect(
      renderSchema(
        {
          allOf: [ref],
          properties: { extra: { type: "string" } },
          required: ["extra", "id"],
        },
        requiredCtx(),
      ),
    ).toBe("Base & {\n  extra: string;\n} & {\n  id: string | null;\n}");
  });

  test("a member with a type of its own stays in the intersection", () => {
    const ctx31 = requiredCtx();
    expect(
      renderSchema(
        { allOf: [{ type: "string" }, { required: [], enum: ["a", "b"] }] },
        ctx31,
      ),
    ).toBe('string & ("a" | "b")');
    expect(
      renderSchema({ allOf: [ref, { required: [], const: "x" }] }, ctx31),
    ).toBe('Base & "x"');
    expect(
      renderSchema(
        {
          allOf: [
            { type: "array", items: { type: "string" } },
            { required: [], items: { type: "number" } },
          ],
        },
        ctx31,
      ),
    ).toContain("Array<number>");
  });

  test("a nested list of names finds the type outside it", () => {
    expect(
      renderSchema(
        { allOf: [ref, { allOf: [{ required: ["id"] }] }] },
        requiredCtx(),
      ),
    ).toBe("Base & {\n  id: string | null;\n}");
  });

  test("a referenced list of names finds the type outside it", () => {
    const withList = requiredCtx();
    withList.doc.components.schemas.RequiredId = {
      type: "object",
      required: ["id"],
    };
    withList.names.set("RequiredId", "RequiredId");
    expect(
      renderSchema(
        { allOf: [ref, { $ref: "#/components/schemas/RequiredId" }] },
        withList,
      ),
    ).toBe("Base & RequiredId & {\n  id: string | null;\n}");
  });

  test("a referenced name declared nowhere adds nothing", () => {
    const withList = requiredCtx();
    withList.doc.components.schemas.Sloppy = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["nope"],
    };
    withList.names.set("Sloppy", "Sloppy");
    expect(
      renderSchema(
        { allOf: [ref, { $ref: "#/components/schemas/Sloppy" }] },
        withList,
      ),
    ).toBe("Base & Sloppy");
  });

  test("a member that declares what it requires adds nothing", () => {
    const withOwn = requiredCtx();
    withOwn.doc.components.schemas.Own = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    withOwn.names.set("Own", "Own");
    expect(
      renderSchema(
        { allOf: [ref, { $ref: "#/components/schemas/Own" }] },
        withOwn,
      ),
    ).toBe("Base & Own");
  });

  test("a name declared nowhere has an unknown type", () => {
    expect(
      renderSchema({ allOf: [ref, { required: ["nope"] }] }, requiredCtx()),
    ).toBe("Base & {\n  nope: unknown;\n}");
  });

  test("properties hidden in this direction stay hidden", () => {
    expect(
      renderSchema({ allOf: [ref, { required: ["secret"] }] }, requiredCtx()),
    ).toBe("Base");
    expect(
      renderSchema(
        { allOf: [ref, { required: ["stamp"] }] },
        requiredCtx("write"),
      ),
    ).toBe("Base");
  });

  test("a cycle of allOf ends", () => {
    const cyclic: SchemaCtx = {
      doc: {
        openapi: "3.0.3",
        components: {
          schemas: {
            Loop: { allOf: [{ $ref: "#/components/schemas/Loop" }] },
          },
        },
      },
      names: new Map([["Loop", "Loop"]]),
    };
    expect(
      renderSchema(
        { allOf: [{ $ref: "#/components/schemas/Loop" }, { required: ["x"] }] },
        cyclic,
      ),
    ).toBe("Loop & {\n  x: unknown;\n}");
  });

  test("OpenAPI 3.1 finds the type behind a $ref with required next to it", () => {
    const ctx31 = requiredCtx();
    ctx31.doc = { ...ctx31.doc, openapi: "3.1.0" };
    expect(renderSchema({ ...ref, required: ["id"] }, ctx31)).toBe(
      "Base & {\n  id: string | null;\n}",
    );
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

describe("OpenAPI 3.1 files", () => {
  test("a media type that is not text is a file", () => {
    for (const contentMediaType of [
      "application/octet-stream",
      "image/png",
      "application/pdf",
      "Application/Zip; q=1",
      "*/*",
    ]) {
      expect(render({ type: "string", contentMediaType })).toBe("Blob | File");
      expect(render({ contentMediaType })).toBe("Blob | File");
    }
    expect(
      render({ type: ["string", "null"], contentMediaType: "image/png" }),
    ).toBe("Blob | File | null");
  });

  test("text, and anything encoded into a string, stays a string", () => {
    for (const contentMediaType of [
      "text/plain",
      "application/json",
      "application/problem+json",
      "application/xml",
      "image/svg+xml",
      "application/x-www-form-urlencoded",
    ]) {
      expect(render({ type: "string", contentMediaType })).toBe("string");
      expect(render({ contentMediaType })).toBe("unknown");
    }
    expect(
      render({
        type: "string",
        contentMediaType: "image/png",
        contentEncoding: "base64",
      }),
    ).toBe("string");
    expect(
      render({ contentMediaType: "image/png", contentEncoding: "base64" }),
    ).toBe("unknown");
  });

  test("the media type does not turn other types into files", () => {
    expect(
      render({ type: "object", contentMediaType: "application/pdf" }),
    ).toBe("{\n  [key: string]: unknown;\n}");
    expect(
      render({
        contentMediaType: "application/pdf",
        properties: { a: { type: "string" } },
      }),
    ).toBe("{\n  a?: string;\n}");
  });
});

describe("oneOf and anyOf next to allOf", () => {
  const cat = { $ref: "#/components/schemas/Pet" };
  const odd = { $ref: "#/components/schemas/my-odd" };

  test("the union narrows the intersection", () => {
    expect(render({ allOf: [cat], oneOf: [odd, { type: "number" }] })).toBe(
      "Pet & (MyOdd | number)",
    );
    expect(render({ allOf: [cat], anyOf: [odd, { type: "number" }] })).toBe(
      "Pet & (MyOdd | number)",
    );
  });

  test("both unions and the schema's own properties are kept", () => {
    expect(
      render({
        allOf: [cat],
        oneOf: [odd, { type: "number" }],
        anyOf: [{ type: "boolean" }, { type: "string" }],
        properties: { a: { type: "string" } },
      }),
    ).toBe("Pet & (MyOdd | number) & (boolean | string) & {\n  a?: string;\n}");
    expect(
      render({
        oneOf: [odd, { type: "number" }],
        anyOf: [{ type: "boolean" }, { type: "string" }],
      }),
    ).toBe("(MyOdd | number) & (boolean | string)");
  });

  test("a single option needs no parentheses, and null is added once", () => {
    expect(render({ allOf: [cat], oneOf: [odd], nullable: true })).toBe(
      "Pet & MyOdd | null",
    );
  });

  test("an empty list is no constraint", () => {
    expect(render({ allOf: [cat], oneOf: [] })).toBe("Pet");
    expect(render({ oneOf: [], anyOf: [odd] })).toBe("MyOdd");
  });
});

describe("discriminator mappings to names with a dot", () => {
  const zoo = {
    components: {
      schemas: {
        "Zoo.Cat": {
          type: "object",
          properties: { kind: { type: "string" }, lives: { type: "integer" } },
        },
        "Zoo.Dog": {
          type: "object",
          properties: { kind: { type: "string" } },
        },
        "Zoo.Animal": {
          oneOf: [
            { $ref: "#/components/schemas/Zoo.Cat" },
            { $ref: "#/components/schemas/Zoo.Dog" },
          ],
          discriminator: {
            propertyName: "kind",
            mapping: {
              cat: "#/components/schemas/Zoo.Cat",
              dog: "Zoo.Dog",
            },
          },
        },
      },
    },
  };
  const zooCtx: SchemaCtx = {
    doc: zoo,
    names: new Map([
      ["Zoo.Cat", "ZooCat"],
      ["Zoo.Dog", "ZooDog"],
      ["Zoo.Animal", "ZooAnimal"],
    ]),
  };

  test("the union pins each member to its mapped value", () => {
    expect(
      renderComponentSchema(
        zoo.components.schemas["Zoo.Animal"],
        "Zoo.Animal",
        zooCtx,
      ),
    ).toBe('({ kind: "cat" } & ZooCat) | ({ kind: "dog" } & ZooDog)');
  });

  test("without a mapping the value is the schema's key, dot included", () => {
    const { mapping: _, ...discriminator } =
      zoo.components.schemas["Zoo.Animal"].discriminator;
    expect(
      renderSchema(
        { ...zoo.components.schemas["Zoo.Animal"], discriminator },
        zooCtx,
      ),
    ).toBe('({ kind: "Zoo.Cat" } & ZooCat) | ({ kind: "Zoo.Dog" } & ZooDog)');
  });
});
