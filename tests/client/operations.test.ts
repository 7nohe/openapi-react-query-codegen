import { describe, expect, test } from "vitest";
import {
  buildSchemaNames,
  classifyResponses,
  collectOperations,
  deref,
  schemaPrimitiveKind,
} from "../../src/client/operations.mts";

const json = (schema: unknown) => ({
  content: { "application/json": { schema } },
});

describe("collectOperations", () => {
  const doc = {
    openapi: "3.1.0",
    security: [{ bearer: [] }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "Bearer" },
        oauth: { type: "oauth2" },
        oidc: { type: "openIdConnect" },
        key: { type: "apiKey", in: "query", name: "k" },
        broken: {},
      },
      parameters: {
        Limit: { name: "limit", in: "query", schema: { type: "integer" } },
      },
      requestBodies: {
        Pet: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
      responses: { Gone: { description: "gone", ...json({ type: "string" }) } },
      schemas: { Pet: { type: "object" } },
    },
    paths: {
      "/pets/{id}": {
        parameters: [
          { name: "id", in: "path", schema: { type: "string" } },
          {
            name: "limit",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        get: {
          operationId: "find pet by id",
          summary: "Find",
          parameters: [
            { $ref: "#/components/parameters/Limit" },
            {
              name: "q",
              in: "query",
              content: { "application/json": { schema: { type: "string" } } },
            },
            { in: "query" },
          ],
          responses: {
            "200": {
              description: "ok",
              ...json({ $ref: "#/components/schemas/Pet" }),
            },
            "404": { $ref: "#/components/responses/Gone" },
            default: { description: "boom" },
          },
        },
        post: {
          requestBody: { $ref: "#/components/requestBodies/Pet" },
          security: [
            { oauth: [] },
            { oidc: [] },
            { key: [] },
            { broken: [] },
            { missing: [] },
          ],
          responses: { 200: { description: "ok" } },
        },
        delete: {
          deprecated: true,
          description: "Removes it",
          requestBody: { content: {} },
          responses: { Default: { description: "x" } },
        },
      },
      "/ref": { $ref: "#/components/pathItems/Shared" },
      "/dup": { get: { operationId: "find pet by id", responses: {} } },
    },
  };
  // Path item refs are dereferenced before use.
  (doc.components as Record<string, unknown>).pathItems = {
    Shared: { head: { responses: {} } },
  };

  const operations = collectOperations(doc);
  const byName = (name: string) =>
    operations.find((op) => op.functionName === name);

  test("derives names, with collision suffixes and path based fallbacks", () => {
    expect(operations.map((op) => op.functionName)).toEqual([
      "findPetById",
      "postPetsById",
      "deletePetsById",
      "headRef",
      "findPetById2",
    ]);
  });

  test("merges path and operation parameters (operation wins)", () => {
    const find = byName("findPetById");
    expect(find?.parameters.map((p) => [p.name, p.in, p.required])).toEqual([
      ["id", "path", true],
      ["limit", "query", false],
      ["q", "query", false],
    ]);
    expect(find?.parameters[2].schema).toEqual({ type: "string" });
    expect(find?.summary).toBe("Find");
  });

  test("keeps the response media type and status", () => {
    const find = byName("findPetById");
    expect(find?.responses.map((r) => r.status)).toEqual([
      "200",
      "404",
      "default",
    ]);
    expect(find?.responses[0].mediaType).toBe("application/json");
    expect(find?.responses[1].schema).toEqual({ type: "string" });
    expect(byName("deletePetsById")?.responses[0].status).toBe("default");
  });

  test("resolves request bodies", () => {
    const post = byName("postPetsById");
    expect(post?.body).toMatchObject({ required: true, kind: "json" });
    expect(byName("deletePetsById")?.body).toBeUndefined();
  });

  test("collects security requirements, falling back to the document", () => {
    expect(byName("findPetById")?.security).toEqual([
      { type: "http", scheme: "bearer" },
    ]);
    expect(byName("postPetsById")?.security).toEqual([
      { type: "http", scheme: "bearer" },
      { type: "apiKey", in: "query", name: "k" },
    ]);
    expect(
      collectOperations({
        paths: { "/x": { get: { security: [{ a: [] }, { a: [] }] } } },
      })[0].security,
    ).toEqual([]);
  });

  test("builds the JSDoc", () => {
    expect(byName("findPetById")?.jsDoc).toBe("/**\n * Find\n */");
    expect(byName("deletePetsById")?.jsDoc).toBe(
      "/**\n * Removes it\n *\n * @deprecated\n */",
    );
    expect(byName("headRef")?.jsDoc).toBeUndefined();
  });

  test("ignores operationId when asked to", () => {
    const names = collectOperations(doc, { useOperationId: false }).map(
      (op) => op.functionName,
    );
    expect(names).toContain("getPetsById");
  });

  test("keeps type names apart from reserved ones and each other", () => {
    const ops = collectOperations(
      {
        paths: {
          "/a": { get: { operationId: "listRuns", responses: {} } },
          "/b": { get: { operationId: "listRuns2", responses: {} } },
        },
      },
      { reservedTypeNames: ["ListRunsResponse"] },
    );
    // Only the colliding name is renumbered; the operation's other types keep
    // the names users import.
    expect(ops.map((op) => op.typeNames)).toEqual([
      {
        data: "ListRunsData",
        errors: "ListRunsErrors",
        error: "ListRunsError",
        responses: "ListRunsResponses",
        response: "ListRunsResponse2",
      },
      {
        data: "ListRuns2Data",
        errors: "ListRuns2Errors",
        error: "ListRuns2Error",
        responses: "ListRuns2Responses",
        response: "ListRuns2Response",
      },
    ]);
    expect(ops.map((op) => op.functionName)).toEqual(["listRuns", "listRuns2"]);
  });

  test("handles documents without paths", () => {
    expect(collectOperations({})).toEqual([]);
  });

  test("detects body kinds", () => {
    const kinds = (mediaType: string) =>
      collectOperations({
        paths: {
          "/x": {
            post: {
              requestBody: { content: { [mediaType]: { schema: {} } } },
              responses: {},
            },
          },
        },
      })[0].body?.kind;
    expect(kinds("application/vnd.api+json")).toBe("json");
    expect(kinds("multipart/form-data")).toBe("form-data");
    expect(kinds("application/x-www-form-urlencoded")).toBe("urlencoded");
    expect(kinds("text/csv")).toBe("text");
    expect(kinds("application/octet-stream")).toBe("binary");
  });
});

describe("deref", () => {
  test("follows chains and rejects dangling refs", () => {
    const doc = { a: { $ref: "#/b" }, b: { x: 1 } };
    expect(deref(doc, { $ref: "#/a" })).toEqual({ x: 1 });
    expect(deref(doc, 5)).toBe(5);
    expect(() => deref(doc, { $ref: "#/missing" })).toThrow("Unresolvable");
  });
});

describe("classifyResponses", () => {
  const make = (...statuses: string[]) =>
    classifyResponses({
      responses: statuses.map((status) => ({ status })),
    } as never);

  test("splits success and error responses", () => {
    const { responses, errors } = make("200", "201", "404", "5XX", "default");
    expect(responses.map((r) => r.status)).toEqual(["200", "201"]);
    expect(errors.map((r) => r.status)).toEqual(["404", "5XX", "default"]);
  });

  test("a lone default response counts as both", () => {
    const { responses, errors } = make("default");
    expect(responses).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  test("ignores informational and redirect statuses", () => {
    const { responses, errors } = make(
      "100",
      "200",
      "2XX",
      "304",
      "3XX",
      "4XX",
    );
    expect(responses.map((r) => r.status)).toEqual(["200", "2XX"]);
    expect(errors.map((r) => r.status)).toEqual(["4XX"]);
  });
});

describe("buildSchemaNames", () => {
  test("deduplicates and reserves ClientOptions", () => {
    const names = buildSchemaNames({
      components: {
        schemas: { ClientOptions: {}, "a-b": {}, "a b": {}, Pet: {} },
      },
    });
    expect([...names.values()]).toEqual(["ClientOptions2", "AB", "AB2", "Pet"]);
    expect(buildSchemaNames({}).size).toBe(0);
  });
});

describe("schemaPrimitiveKind", () => {
  const doc = {
    components: {
      schemas: { Id: { type: "integer" }, Name: { type: "string" } },
    },
    other: { type: "number" },
  };
  test("resolves refs and unions", () => {
    expect(schemaPrimitiveKind(doc, { $ref: "#/components/schemas/Id" })).toBe(
      "number",
    );
    expect(
      schemaPrimitiveKind(doc, { $ref: "#/components/schemas/Name" }),
    ).toBe("string");
    expect(schemaPrimitiveKind(doc, { $ref: "#/other" })).toBe("number");
    expect(schemaPrimitiveKind(doc, { type: ["string", "null"] })).toBe(
      "string",
    );
    expect(schemaPrimitiveKind(doc, { enum: ["a", "b"] })).toBe("string");
    expect(schemaPrimitiveKind(doc, { enum: [1, 2, null] })).toBe("number");
    expect(schemaPrimitiveKind(doc, { enum: [1, "a"] })).toBe("other");
    expect(schemaPrimitiveKind(doc, { enum: [true] })).toBe("other");
    expect(schemaPrimitiveKind(doc, { type: "object" })).toBe("other");
    expect(schemaPrimitiveKind(doc, { type: ["string", "number"] })).toBe(
      "other",
    );
    expect(schemaPrimitiveKind(doc, undefined)).toBe("other");
    expect(
      schemaPrimitiveKind(doc, { $ref: "#/components/schemas/Nope" }),
    ).toBe("other");
  });

  test("gives up on reference cycles", () => {
    expect(schemaPrimitiveKind({ a: { $ref: "#/a" } }, { $ref: "#/a" })).toBe(
      "other",
    );
  });
});
