// `--useDateType`: `date` and `date-time` strings are typed `Date`, and the
// generated transformers make them `Date` objects in successful responses.

import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  generateClient,
  writeGeneratedFiles,
} from "../../src/client/index.mts";
import { generate } from "../../src/generate.mjs";
import { generateTestClient, inputPath } from "../utils";

const file = (
  generated: { files: { name: string; content: string }[] },
  name: string,
) => generated.files.find((f) => f.name === name)?.content;

// biome-ignore lint/suspicious/noExplicitAny: the transformers return what they are given
type Transformer = (data: unknown) => any;
type Transformers = Record<string, Transformer>;

describe("useDateType - generated files", () => {
  let generated: Awaited<ReturnType<typeof generateTestClient>>;
  let transformers: Transformers;
  let dir: string;
  beforeAll(async () => {
    generated = await generateTestClient("dates.yaml", { useDateType: true });
    dir = await mkdtemp(path.join(__dirname, "dates-"));
    await writeGeneratedFiles(dir, generated.files);
    transformers = await import(path.join(dir, "transformers.gen.ts"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("types.gen.ts", () => {
    expect(file(generated, "types.gen.ts")).toMatchSnapshot();
  });

  test("transformers.gen.ts", () => {
    expect(file(generated, "transformers.gen.ts")).toMatchSnapshot();
  });

  test("the SDK passes each operation its transformer", () => {
    const sdk = file(generated, "sdk.gen.ts") ?? "";
    expect(sdk).toContain(
      'import { createEventResponseTransformer, getEventResponseTransformer, getMixedResponseTransformer, getPlainResponseTransformer, listEventsResponseTransformer, listPetsResponseTransformer } from "./transformers.gen";',
    );
    expect(sdk).toMatch(
      /listEvents = [^;]*\(\{\n {2}responseTransformer: listEventsResponseTransformer,/,
    );
    // Nothing to convert, and nothing that could be told apart.
    expect(sdk).not.toContain("getNoneResponseTransformer");
    expect(sdk).not.toContain("getJobResponseTransformer");
  });

  test("only what a response reaches is generated", () => {
    const content = file(generated, "transformers.gen.ts") ?? "";
    expect(content).not.toContain("unusedSchemaResponseTransformer");
    expect(content).not.toContain("plainSchemaResponseTransformer");
    expect(Object.keys(transformers).sort()).toEqual([
      "createEventResponseTransformer",
      "getEventResponseTransformer",
      "getMixedResponseTransformer",
      "getPlainResponseTransformer",
      "listEventsResponseTransformer",
      "listPetsResponseTransformer",
    ]);
  });

  test("unions that cannot be told apart are reported", () => {
    expect(generated.warnings).toHaveLength(1);
    expect(generated.warnings[0]).toContain("--useDateType");
    expect(generated.warnings[0]).toContain(
      "#/components/schemas/Mixed/properties/ambiguous/oneOf",
    );
    expect(generated.warnings[0]).toContain("GET /job responses");
  });

  test("dates in objects, arrays and referenced schemas", () => {
    const [event] = transformers.listEventsResponseTransformer([
      {
        id: 1,
        name: "launch",
        createdAt: "2024-05-01T10:00:00.000Z",
        updatedAt: null,
        day: "2024-05-02",
        parent: { createdAt: "2023-01-01T00:00:00.000Z" },
        windows: [{ from: "2024-05-01T10:00:00.000Z" }, null],
        plain: { name: "2024-05-01" },
      },
    ]);
    expect(event.createdAt).toEqual(new Date("2024-05-01T10:00:00.000Z"));
    expect(event.updatedAt).toBeNull();
    expect(event.day).toEqual(new Date("2024-05-02"));
    expect(event.parent.createdAt).toBeInstanceOf(Date);
    expect(event.windows[0].from).toBeInstanceOf(Date);
    expect(event.windows[1]).toBeNull();
    expect(event.name).toBe("launch");
    expect(event.plain).toEqual({ name: "2024-05-01" });
    // A property the response left out is not added.
    expect(Object.keys(event.parent)).toEqual(["createdAt"]);
    expect("to" in event.windows[0]).toBe(false);
  });

  test("maps, tuples and pattern properties", () => {
    const data = transformers.getEventResponseTransformer({
      fetchedAt: "2024-05-01T10:00:00.000Z",
      history: ["2024-05-01T10:00:00.000Z", 5],
      byDay: { a: "2024-05-01", b: null },
      pair: ["2024-05-01T10:00:00.000Z", 7, "2024-05-03"],
      marks: {
        count: 2,
        at_start: "2024-05-01T10:00:00.000Z",
        n_total: 3,
        other: "2024-05-04",
      },
    });
    expect(data.fetchedAt).toBeInstanceOf(Date);
    expect(data.history[0]).toBeInstanceOf(Date);
    expect(data.history[1]).toBe(5);
    expect(data.byDay.a).toBeInstanceOf(Date);
    expect(data.byDay.b).toBeNull();
    expect(data.pair[0]).toBeInstanceOf(Date);
    expect(data.pair[1]).toBe(7);
    expect(data.pair[2]).toBeInstanceOf(Date);
    expect(data.marks).toEqual({
      count: 2,
      at_start: new Date("2024-05-01T10:00:00.000Z"),
      n_total: 3,
      other: new Date("2024-05-04"),
    });
    expect("event" in data).toBe(false);
  });

  test("a discriminator tells the members of a union apart", () => {
    const [cat, dog, other] = transformers.listPetsResponseTransformer([
      { kind: "cat", bornAt: "2020-01-01" },
      { kind: "dog", bornAt: "spring", adoptedAt: "2021-01-01" },
      { kind: "fish", bornAt: "2022-01-01" },
    ]);
    expect(cat.bornAt).toBeInstanceOf(Date);
    expect(dog.bornAt).toBe("spring");
    expect(dog.adoptedAt).toBeInstanceOf(Date);
    expect(other.bornAt).toBe("2022-01-01");
  });

  test("unions of different shapes, and what stays a string", () => {
    const at = "2024-05-01T10:00:00.000Z";
    const data = transformers.getMixedResponseTransformer({
      ambiguous: { from: at, at },
      stringOrDate: at,
      nullableDate: at,
      dateOrProblem: { at },
      stamp: at,
      fixed: "2024-01-01",
      "odd-key": at,
    });
    // Two objects without a discriminator: left as they came.
    expect(data.ambiguous).toEqual({ from: at, at });
    // Typed `string | Date`, so the string is right as it is.
    expect(data.stringOrDate).toBe(at);
    expect(data.nullableDate).toBeInstanceOf(Date);
    expect(data.dateOrProblem.at).toBeInstanceOf(Date);
    expect(data.stamp).toBeInstanceOf(Date);
    expect(data.fixed).toBe("2024-01-01");
    expect(data["odd-key"]).toBeInstanceOf(Date);

    const scalar = transformers.getMixedResponseTransformer({
      nullableDate: null,
      dateOrProblem: at,
    });
    expect(scalar.nullableDate).toBeNull();
    expect(scalar.dateOrProblem).toBeInstanceOf(Date);
    expect(
      transformers.getMixedResponseTransformer({ dateOrProblem: 3 })
        .dateOrProblem,
    ).toBe(3);
  });

  test("values of another shape pass through", () => {
    expect(transformers.getPlainResponseTransformer("2024-05-01")).toEqual(
      new Date("2024-05-01"),
    );
    expect(transformers.getPlainResponseTransformer(null)).toBeNull();
    expect(transformers.listEventsResponseTransformer({})).toEqual({});
    expect(transformers.createEventResponseTransformer("text")).toBe("text");
    expect(transformers.getEventResponseTransformer([1])).toEqual([1]);
  });
});

describe("useDateType - off and edge cases", () => {
  test("without the option dates are strings and nothing is transformed", async () => {
    const generated = await generateTestClient("dates.yaml");
    expect(file(generated, "transformers.gen.ts")).toBeUndefined();
    expect(file(generated, "sdk.gen.ts")).not.toContain("responseTransformer");
    expect(file(generated, "types.gen.ts")).not.toContain("Date;");
    expect(generated.warnings).toEqual([]);
  });

  test("a specification without dates gets no transformers", async () => {
    const generated = await generateTestClient("petstore.yaml", {
      useDateType: true,
    });
    expect(file(generated, "transformers.gen.ts")).toBeUndefined();
    expect(file(generated, "sdk.gen.ts")).not.toContain("transformers.gen");
  });

  test("a schema named Date leaves the global one reachable", async () => {
    const generated = await generateClient({
      input: JSON.stringify({
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {
          "/a": {
            get: {
              operationId: "getA",
              responses: {
                200: {
                  description: "ok",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/Date" },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Date: {
              type: "object",
              properties: {
                at: { type: "string", format: "date-time" },
                // `nullable` and a `$ref` next to other keywords, as 3.0 has it.
                end: { type: "string", format: "date", nullable: true },
                getA: { $ref: "#/components/schemas/Date" },
              },
            },
            getA: { type: "string", format: "date" },
          },
        },
      }),
      client: "fetch",
      importExtension: ".js",
      pageParam: "page",
      useDateType: true,
    });
    const types = file(generated, "types.gen.ts") ?? "";
    expect(types).toContain("at?: globalThis.Date;");
    expect(types).toContain("end?: globalThis.Date | null;");
    expect(file(generated, "sdk.gen.ts")).toContain(
      'from "./transformers.gen.js";',
    );
    // The operation's name is taken, so the schema's function gets a number.
    const transformers = file(generated, "transformers.gen.ts") ?? "";
    expect(transformers).toContain("export const getAResponseTransformer = ");
    expect(transformers).toContain("const dateSchemaResponseTransformer = ");
  });
});

describe("useDateType - how schemas are read", () => {
  let dir: string;
  let count = 0;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(__dirname, "dates-inline-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const date = { type: "string", format: "date" };
  const at = "2024-05-01";

  /** The transformer of `GET /a` answering with `schema`, and the warnings. */
  const build = async (
    schema: unknown,
    schemas?: Record<string, unknown>,
    openapi = "3.1.0",
  ) => {
    const generated = await generateClient({
      input: JSON.stringify({
        openapi,
        info: { title: "t", version: "1" },
        paths: {
          "/a": {
            get: {
              operationId: "getA",
              responses: {
                200: {
                  description: "ok",
                  content: { "application/json": { schema } },
                },
              },
            },
          },
        },
        ...(schemas ? { components: { schemas } } : {}),
      }),
      client: "fetch",
      importExtension: "",
      pageParam: "page",
      useDateType: true,
    });
    const out = path.join(dir, String(count++));
    await writeGeneratedFiles(out, generated.files);
    const content = file(generated, "transformers.gen.ts");
    const transform: Transformer =
      content === undefined
        ? (data) => data
        : (await import(path.join(out, "transformers.gen.ts")))
            .getAResponseTransformer;
    return { transform, content, warnings: generated.warnings };
  };

  test("an inline response without components", async () => {
    const { transform } = await build({
      type: "object",
      properties: { at: date },
    });
    expect(transform({ at }).at).toBeInstanceOf(Date);
  });

  test("schemas without a type are read by their keywords", async () => {
    const { transform, content } = await build({
      properties: {
        list: { items: date },
        tuple: { prefixItems: [{ type: "integer" }, date] },
        map: { additionalProperties: date },
        deep: {
          type: "array",
          items: { type: "array", items: { additionalProperties: date } },
        },
        count: { type: "integer" },
        anything: {},
        nothing: { type: "array", items: { type: "integer" } },
        closed: {
          type: "object",
          patternProperties: { "^n": { type: "integer" } },
        },
      },
    });
    const data = transform({
      list: [at],
      tuple: [at, at, at],
      map: { a: at },
      deep: [[{ a: at }]],
      anything: at,
      nothing: [at],
      closed: { n: at },
    });
    expect(data.list[0]).toBeInstanceOf(Date);
    expect(data.tuple[0]).toBe(at);
    expect(data.tuple[1]).toBeInstanceOf(Date);
    expect(data.tuple[2]).toBe(at);
    expect(data.map.a).toBeInstanceOf(Date);
    expect(data.deep[0][0].a).toBeInstanceOf(Date);
    expect(data.anything).toBe(at);
    expect(data.nothing).toEqual([at]);
    expect(data.closed).toEqual({ n: at });
    // Loops inside loops get names of their own.
    expect(content).toContain("for (let i2 = 0;");
    expect(content).toContain("for (const key3 of");
  });

  test("patterns apply on their own, and a broken one is left out", async () => {
    const { transform } = await build({
      type: "object",
      patternProperties: { "^at_": date, "[": date },
    });
    expect(transform({ at_a: at, "[": at, b: at })).toEqual({
      at_a: new Date(at),
      "[": at,
      b: at,
    });
  });

  test("references: with keywords next to them, into a schema, missing, circular", async () => {
    const { transform } = await build(
      {
        type: "object",
        properties: {
          extended: {
            $ref: "#/components/schemas/Window",
            properties: { extra: date },
          },
          inner: { $ref: "#/components/schemas/Window/properties/from" },
          missing: { $ref: "#/components/schemas/Nowhere" },
          node: { $ref: "#/components/schemas/Node/properties/next" },
        },
      },
      {
        Window: { type: "object", properties: { from: date } },
        Node: {
          type: "object",
          properties: {
            next: {
              type: "object",
              properties: {
                at: date,
                next: { $ref: "#/components/schemas/Node/properties/next" },
              },
            },
          },
        },
      },
    );
    const data = transform({
      extended: { from: at, extra: at },
      inner: at,
      missing: at,
      node: { at, next: { at } },
    });
    expect(data.extended.from).toBeInstanceOf(Date);
    expect(data.extended.extra).toBeInstanceOf(Date);
    expect(data.inner).toBeInstanceOf(Date);
    expect(data.missing).toBe(at);
    expect(data.node.at).toBeInstanceOf(Date);
    // The pointer comes back to itself, where the types stop as well.
    expect(data.node.next.at).toBe(at);
  });

  test("in 3.0 keywords next to a reference are ignored", async () => {
    const { transform } = await build(
      {
        $ref: "#/components/schemas/Window",
        properties: { extra: date },
      },
      { Window: { type: "object", properties: { from: date } } },
      "3.0.3",
    );
    expect(transform({ from: at, extra: at })).toEqual({
      from: new Date(at),
      extra: at,
    });
  });

  test("union members of different shapes are each converted", async () => {
    const { transform, warnings } = await build(
      {
        type: "object",
        properties: {
          a: { oneOf: [date, { type: ["integer", "null"] }, { const: 1 }] },
          b: {
            anyOf: [
              { $ref: "#/components/schemas/Window" },
              { type: "array", items: date },
              { enum: [1, null, true] },
            ],
          },
          c: {
            // A union with properties of its own next to it.
            oneOf: [{ type: "object" }],
            properties: { at: date },
          },
          d: { $ref: "#/components/schemas/DateOrWindow" },
          e: {
            oneOf: [
              { allOf: [{ type: "object" }], properties: { at: date } },
              { oneOf: [{ type: "integer" }, { type: "boolean" }] },
              false,
            ],
          },
        },
      },
      {
        Window: { type: "object", properties: { from: date } },
        DateOrWindow: {
          oneOf: [date, { $ref: "#/components/schemas/Window" }],
        },
      },
    );
    expect(warnings).toEqual([]);
    expect(transform({ a: at }).a).toBeInstanceOf(Date);
    expect(transform({ a: 1 }).a).toBe(1);
    expect(transform({ b: { from: at } }).b.from).toBeInstanceOf(Date);
    expect(transform({ b: [at] }).b[0]).toBeInstanceOf(Date);
    expect(transform({ b: true }).b).toBe(true);
    expect(transform({ c: { at } }).c.at).toBeInstanceOf(Date);
    expect(transform({ d: at }).d).toBeInstanceOf(Date);
    expect(transform({ d: { from: at } }).d.from).toBeInstanceOf(Date);
    expect(transform({ e: { at } }).e.at).toBeInstanceOf(Date);
  });

  test("union members of one shape are left alone and reported", async () => {
    const { transform, warnings } = await build(
      {
        type: "object",
        properties: {
          text: { oneOf: [date, { const: "never" }] },
          anything: { oneOf: [date, true] },
          lists: { oneOf: [{ type: "array", items: date }, { enum: [[1]] }] },
          objects: {
            oneOf: [
              { $ref: "#/components/schemas/Window" },
              { const: { from: "x" } },
            ],
          },
          loop: {
            oneOf: [
              { $ref: "#/components/schemas/Window" },
              { $ref: "#/components/schemas/LoopA" },
            ],
          },
          // The reference would change both shapes, and one of them is taken.
          partly: {
            oneOf: [
              { $ref: "#/components/schemas/DateOrWindow" },
              { type: "object", properties: { from: { type: "string" } } },
            ],
          },
        },
      },
      {
        Window: { type: "object", properties: { from: date } },
        DateOrWindow: {
          oneOf: [date, { $ref: "#/components/schemas/Window" }],
        },
        LoopA: { $ref: "#/components/schemas/LoopB" },
        LoopB: { $ref: "#/components/schemas/LoopA" },
      },
    );
    const input = {
      text: at,
      anything: at,
      lists: [at],
      objects: { from: at },
      loop: { from: at },
      partly: at,
    };
    expect(transform(structuredClone(input))).toEqual(input);
    expect(warnings).toHaveLength(1);
    const reported = warnings[0].split("\n").slice(1).sort();
    expect(reported).toEqual([
      "  - GET /a responses/0/properties/lists/oneOf",
      "  - GET /a responses/0/properties/loop/oneOf",
      "  - GET /a responses/0/properties/objects/oneOf",
      "  - GET /a responses/0/properties/partly/oneOf",
    ]);
  });

  test("a discriminator without a mapping goes by the schema names", async () => {
    const pet = (extra: Record<string, unknown>) => ({
      type: "object",
      required: ["kind"],
      properties: { kind: { type: "string" }, ...extra },
    });
    const { transform, warnings } = await build(
      {
        oneOf: [
          { $ref: "#/components/schemas/Cat" },
          { $ref: "#/components/schemas/Dog" },
          { $ref: "#/components/schemas/Fish" },
        ],
        discriminator: { propertyName: "kind" },
      },
      {
        Cat: pet({ bornAt: date }),
        Dog: pet({ bornAt: { type: "string" } }),
        // Pins the property itself, to a value that is not its name.
        Fish: pet({ kind: { const: "fish" }, caughtAt: date }),
      },
    );
    expect(warnings).toEqual([]);
    expect(transform({ kind: "Cat", bornAt: at }).bornAt).toBeInstanceOf(Date);
    expect(transform({ kind: "Dog", bornAt: at }).bornAt).toBe(at);
    expect(transform({ kind: "fish", caughtAt: at }).caughtAt).toBeInstanceOf(
      Date,
    );
    expect(transform({ kind: "Fish", caughtAt: at }).caughtAt).toBe(at);
    expect(transform(null)).toBeNull();
  });

  test("a discriminator that does not cover every member is no help", async () => {
    const { transform, warnings } = await build(
      {
        oneOf: [
          { $ref: "#/components/schemas/Cat" },
          { type: "object", properties: { bornAt: { type: "string" } } },
        ],
        discriminator: { propertyName: "kind" },
      },
      { Cat: { type: "object", properties: { bornAt: date } } },
    );
    expect(transform({ kind: "Cat", bornAt: at }).bornAt).toBe(at);
    expect(warnings[0]).toContain("GET /a responses/0/oneOf");
  });
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/events" && req.method === "GET") {
    res.end(
      JSON.stringify([
        {
          createdAt: "2024-05-01T10:00:00.000Z",
          name: url.searchParams.get("since"),
        },
      ]),
    );
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ at: "2024-05-01T10:00:00.000Z" }));
  }
});

let baseUrl: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

for (const client of ["fetch", "axios"] as const) {
  describe(`useDateType - generated hooks over the ${client} client`, () => {
    const outputDir = path.join("tests", "client", `dates-${client}-outputs`);
    const importDir = path.join(__dirname, `dates-${client}-outputs`);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    beforeAll(async () => {
      await generate(
        {
          input: inputPath("dates.yaml"),
          output: outputDir,
          client,
          useDateType: true,
          pageParam: "page",
          nextPageParam: "nextPage",
          initialPageParam: "1",
        },
        "0.0.0-test",
      );
      const generated = await import(
        path.join(importDir, "requests", "client.gen.ts")
      );
      generated.client.setConfig(
        client === "axios" ? { baseURL: baseUrl } : { baseUrl },
      );
    }, 60000);
    afterAll(async () => {
      await rm(importDir, { recursive: true, force: true });
    });

    test("a query resolves with Date objects and sends them as ISO strings", async () => {
      const { listEventsOptions } = await import(
        path.join(importDir, "queries", "queryOptions.ts")
      );
      const since = new Date("2024-01-01T00:00:00.000Z");
      const events = await qc.fetchQuery(
        listEventsOptions({ query: { since } }),
      );
      expect(events[0].createdAt).toEqual(new Date("2024-05-01T10:00:00.000Z"));
      expect(events[0].name).toBe("2024-01-01T00:00:00.000Z");
    });

    test("an error is passed on as it came", async () => {
      const { getEventOptions } = await import(
        path.join(importDir, "queries", "queryOptions.ts")
      );
      const failure = await qc
        .fetchQuery(getEventOptions({ path: { id: "x" } }))
        .catch((error: unknown) => error);
      const body =
        client === "axios"
          ? (failure as { response: { data: unknown } }).response.data
          : failure;
      expect(body).toEqual({ at: "2024-05-01T10:00:00.000Z" });
    });
  });
}
