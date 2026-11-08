import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createClient,
  createConfig,
  Interceptors,
  serializeQuery,
} from "../../src/client/runtime/fetch.runtime.ts";

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = Buffer.concat(chunks).toString("utf-8");
    switch (url.pathname) {
      case "/empty":
        res.statusCode = 204;
        res.end();
        return;
      case "/text":
        res.setHeader("content-type", "text/plain");
        res.end("plain text");
        return;
      case "/bin":
        res.setHeader("content-type", "application/octet-stream");
        res.end(Buffer.from([1, 2, 3]));
        return;
      case "/nocontent-type":
        res.end("raw");
        return;
      case "/empty-json":
        res.setHeader("content-type", "application/json");
        res.end("");
        return;
      case "/form":
        res.setHeader("content-type", "multipart/form-data; boundary=x");
        res.end(
          '--x\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--x--\r\n',
        );
        return;
      case "/err-json":
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ code: 500 }));
        return;
      case "/err-text":
        res.statusCode = 502;
        res.end("bad gateway");
        return;
      case "/err-empty":
        res.statusCode = 503;
        res.end();
        return;
      default:
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            method: req.method,
            path: url.pathname,
            search: url.search,
            headers: req.headers,
            body,
          }),
        );
    }
  });
});

let baseUrl: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const make = (config = {}) =>
  createClient(createConfig({ baseUrl, ...config }));

describe("fetch runtime: requests", () => {
  test("every verb sends its method", async () => {
    const client = make();
    for (const verb of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
      "trace",
      "connect",
    ] as const) {
      if (verb === "head" || verb === "connect" || verb === "trace") continue;
      const { data } = await client[verb]({ url: "/echo" });
      expect((data as { method: string }).method).toBe(verb.toUpperCase());
    }
    const head = await client.head({ url: "/echo" });
    expect(head.response.status).toBe(200);
  });

  test("substitutes and encodes path parameters", async () => {
    const { data } = await make().get({
      url: "/items/{id}/{tags}/{pair}/{when}/{kept}",
      path: {
        id: "a b/c",
        tags: ["x", "y z"],
        pair: { k: "v" },
        when: new Date("2026-01-02T03:04:05.000Z"),
        nothing: null,
      },
    });
    expect((data as { path: string }).path).toBe(
      "/items/a%20b%2Fc/x,y%20z/k,v/2026-01-02T03%3A04%3A05.000Z/%7Bkept%7D",
    );
  });

  test("builds query strings", async () => {
    const { data } = await make().get({
      url: "/echo",
      query: { a: 1, b: [1, 2], c: null, d: undefined, e: "x y", f: true },
    });
    expect((data as { search: string }).search).toBe(
      "?a=1&b=1&b=2&e=x%20y&f=true",
    );
  });

  test("honours query serializer options and functions", async () => {
    expect(
      serializeQuery(
        {
          csv: [1, 2],
          pipe: ["a", "b"],
          space: ["a", "b"],
          deep: { x: 1, y: [2], z: null },
          flat: { x: 1, y: 2 },
          joined: { x: 1, y: 2 },
          when: new Date("2026-01-01T00:00:00.000Z"),
          loose: [1, null, undefined],
        },
        {
          parameters: {
            csv: { array: { style: "form", explode: false } },
            pipe: { array: { style: "pipeDelimited", explode: false } },
            space: { array: { style: "spaceDelimited", explode: false } },
            flat: { object: { style: "form", explode: true } },
            joined: { object: { style: "form", explode: false } },
          },
        },
      ),
    ).toBe(
      "csv=1,2&pipe=a|b&space=a%20b&deep[x]=1&deep[y]=%5B2%5D&x=1&y=2&joined=x,1,y,2&when=2026-01-01T00%3A00%3A00.000Z&loose=1",
    );
    const custom = await make().get({
      url: "/echo",
      query: { a: 1 },
      querySerializer: (query) => `custom=${JSON.stringify(query)}`,
    });
    expect(decodeURIComponent((custom.data as { search: string }).search)).toBe(
      '?custom={"a":1}',
    );
  });

  test("joins base URLs and paths", () => {
    const client = createClient({ baseUrl: "https://x.test/api/" });
    expect(
      client.buildUrl({ url: "pets", baseUrl: "https://x.test/api/" }),
    ).toBe("https://x.test/api/pets");
    expect(
      client.buildUrl({ url: "https://other.test/a?x=1", query: { y: 2 } }),
    ).toBe("https://other.test/a?x=1&y=2");
    expect(client.buildUrl({ url: "/a", query: {} })).toBe("/a");
    expect(client.buildUrl({ url: "" })).toBe("");
  });

  test("serializes JSON bodies", async () => {
    const { data } = await make().post({
      url: "/echo",
      body: { n: 1n, s: "x" },
      bodyType: "json",
    });
    const echoed = data as { body: string; headers: Record<string, string> };
    expect(echoed.body).toBe('{"n":"1","s":"x"}');
    expect(echoed.headers["content-type"]).toBe("application/json");
  });

  test("detects JSON bodies without a bodyType, but leaves strings and binary alone", async () => {
    const client = make();
    const json = await client.post({ url: "/echo", body: { a: 1 } });
    expect((json.data as { body: string }).body).toBe('{"a":1}');
    const text = await client.post({
      url: "/echo",
      body: "raw",
      headers: { "Content-Type": "text/plain" },
    });
    expect((text.data as { body: string }).body).toBe("raw");
    const blob = await client.post({ url: "/echo", body: new Blob(["bin"]) });
    expect((blob.data as { body: string }).body).toBe("bin");
    const params = await client.post({
      url: "/echo",
      body: new URLSearchParams({ a: "1" }),
    });
    expect((params.data as { body: string }).body).toBe("a=1");
    const buffer = await client.post({
      url: "/echo",
      body: new Uint8Array([104, 105]),
    });
    expect((buffer.data as { body: string }).body).toBe("hi");
    const array = await client.post({ url: "/echo", body: new ArrayBuffer(0) });
    expect((array.data as { body: string }).body).toBe("");
    const stream = await client.post({ url: "/echo", body: new FormData() });
    expect((stream.data as { body: string }).body).toContain("");
  });

  test("serializes form-data and urlencoded bodies", async () => {
    const client = make();
    const form = await client.post({
      url: "/echo",
      bodyType: "form-data",
      body: {
        a: "1",
        list: ["x", "y"],
        blob: new Blob(["b"]),
        when: new Date("2026-01-01T00:00:00.000Z"),
        obj: { k: 1 },
        n: 5,
        skip: undefined,
        none: null,
      },
    });
    const echoed = form.data as {
      body: string;
      headers: Record<string, string>;
    };
    expect(echoed.headers["content-type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    for (const part of [
      'name="a"',
      'name="list"',
      'name="blob"',
      "2026-01-01",
      '{"k":1}',
      "\r\n5\r\n",
    ]) {
      expect(echoed.body).toContain(part);
    }
    expect(echoed.body).not.toContain('name="skip"');
    const existing = new FormData();
    existing.append("z", "1");
    const passthrough = await client.post({
      url: "/echo",
      bodyType: "form-data",
      body: existing,
    });
    expect((passthrough.data as { body: string }).body).toContain('name="z"');
    const urlencoded = await client.post({
      url: "/echo",
      bodyType: "urlencoded",
      body: { a: "1 2", list: [1, 2], skip: null, o: { k: 1 } },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect((urlencoded.data as { body: string }).body).toBe(
      "a=1+2&list=1&list=2&o=%7B%22k%22%3A1%7D",
    );
    const passUrl = await client.post({
      url: "/echo",
      bodyType: "urlencoded",
      body: new URLSearchParams({ q: "1" }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect((passUrl.data as { body: string }).body).toBe("q=1");
  });

  test("a custom body serializer wins; an empty body drops Content-Type", async () => {
    const client = make();
    const custom = await client.post({
      url: "/echo",
      body: { a: 1 },
      bodySerializer: (body) => `custom:${JSON.stringify(body)}`,
    });
    expect((custom.data as { body: string }).body).toBe('custom:{"a":1}');
    const none = await client.post({
      url: "/echo",
      headers: { "Content-Type": "application/json" },
    });
    expect(
      (none.data as { headers: Record<string, string> }).headers[
        "content-type"
      ],
    ).toBeUndefined();
  });

  test("merges headers from every supported shape", async () => {
    const client = make({
      headers: {
        "X-Base": "base",
        "X-Drop": "drop",
        "X-Num": 1,
        "X-Obj": { a: 1 },
        "X-Skip": undefined,
      },
    });
    const withObject = await client.get({
      url: "/echo",
      headers: { "X-Drop": null, "X-List": ["a", "b"], "X-Bool": true },
    });
    const headers = (withObject.data as { headers: Record<string, string> })
      .headers;
    expect(headers["x-base"]).toBe("base");
    expect(headers["x-drop"]).toBeUndefined();
    expect(headers["x-list"]).toBe("a, b");
    expect(headers["x-num"]).toBe("1");
    expect(headers["x-obj"]).toBe('{"a":1}');
    const withHeaders = await client.get({
      url: "/echo",
      headers: new Headers({ "X-From": "headers" }),
    });
    expect(
      (withHeaders.data as { headers: Record<string, string> }).headers[
        "x-from"
      ],
    ).toBe("headers");
    const withTuples = await client.get({
      url: "/echo",
      headers: [["X-Tuple", "t"]],
    });
    expect(
      (withTuples.data as { headers: Record<string, string> }).headers[
        "x-tuple"
      ],
    ).toBe("t");
  });

  test("setConfig merges and getConfig returns a copy", () => {
    const client = createClient({
      baseUrl: "http://a.test",
      headers: { "X-A": "a" },
    });
    const next = client.setConfig({
      baseUrl: "http://b.test",
      headers: { "X-B": "b" },
    });
    expect(next.baseUrl).toBe("http://b.test");
    expect((next.headers as Headers).get("x-a")).toBe("a");
    expect((next.headers as Headers).get("x-b")).toBe("b");
    const copy = client.getConfig();
    copy.baseUrl = "changed";
    expect(client.getConfig().baseUrl).toBe("http://b.test");
  });

  test("uses a custom fetch and passes through RequestInit options", async () => {
    let seen: Request | undefined;
    const client = createClient({
      baseUrl: "http://stub.test",
      fetch: (async (request: Request) => {
        seen = request;
        return new Response('{"ok":true}', {
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    const { data } = await client.get({
      url: "/x",
      credentials: "include",
      cache: "no-store",
    });
    expect(data).toEqual({ ok: true });
    expect(seen?.credentials).toBe("include");
    expect(seen?.url).toBe("http://stub.test/x");
  });
});

describe("fetch runtime: responses", () => {
  test("parses by content type", async () => {
    const client = make();
    expect((await client.get({ url: "/text" })).data).toBe("plain text");
    expect(((await client.get({ url: "/bin" })).data as Blob).size).toBe(3);
    expect((await client.get({ url: "/nocontent-type" })).data).toBe("raw");
    expect((await client.get({ url: "/empty" })).data).toBe(undefined);
    expect((await client.get({ url: "/empty", parseAs: "json" })).data).toEqual(
      {},
    );
    expect((await client.get({ url: "/empty-json" })).data).toEqual({});
  });

  test("honours an explicit parseAs", async () => {
    const client = make();
    expect(
      (
        (await client.get({ url: "/bin", parseAs: "arrayBuffer" }))
          .data as ArrayBuffer
      ).byteLength,
    ).toBe(3);
    expect((await client.get({ url: "/text", parseAs: "text" })).data).toBe(
      "plain text",
    );
    expect(
      (
        (await client.get({ url: "/bin", parseAs: "stream" }))
          .data as ReadableStream
      ).getReader,
    ).toBeTypeOf("function");
    const form = (await client.get({ url: "/form", parseAs: "formData" }))
      .data as FormData;
    expect(form.get("a")).toBe("1");
    expect(
      ((await client.get({ url: "/text", parseAs: "blob" })).data as Blob).size,
    ).toBe(10);
    expect((await client.get({ url: "/form" })).data).toBeInstanceOf(FormData);
  });

  test("returns errors unless throwOnError is set", async () => {
    const client = make();
    const json = await client.get({ url: "/err-json" });
    expect(json).toMatchObject({ error: { code: 500 } });
    expect((json as { data?: unknown }).data).toBeUndefined();
    expect(json.response.status).toBe(500);
    expect((await client.get({ url: "/err-text" })).error).toBe("bad gateway");
    expect((await client.get({ url: "/err-empty" })).error).toEqual({});
  });

  test("throws parsed errors when asked", async () => {
    const client = make();
    await expect(
      client.get({ url: "/err-json", throwOnError: true }),
    ).rejects.toEqual({ code: 500 });
    await expect(
      client.get({ url: "/err-text", throwOnError: true }),
    ).rejects.toBe("bad gateway");
    const configured = make({ throwOnError: true });
    await expect(configured.get({ url: "/err-empty" })).rejects.toEqual({});
  });
});

describe("fetch runtime: interceptors", () => {
  test("request and response interceptors run in order and can be ejected", async () => {
    const client = make();
    const order: string[] = [];
    const first = client.interceptors.request.use((request) => {
      order.push("req1");
      request.headers.set("X-Intercepted", "yes");
      return request;
    });
    client.interceptors.request.use((request) => {
      order.push("req2");
      return request;
    });
    const response = client.interceptors.response.use((res) => {
      order.push("res");
      return res;
    });
    const { data } = await client.get({ url: "/echo" });
    expect(
      (data as { headers: Record<string, string> }).headers["x-intercepted"],
    ).toBe("yes");
    expect(order).toEqual(["req1", "req2", "res"]);
    expect(client.interceptors.request.exists(first)).toBe(true);
    client.interceptors.request.eject(first);
    client.interceptors.request.eject(999);
    client.interceptors.response.eject(response);
    expect(client.interceptors.request.exists(first)).toBe(false);
    order.length = 0;
    await client.get({ url: "/echo" });
    expect(order).toEqual(["req2"]);
    client.interceptors.request.clear();
    expect(client.interceptors.request.fns).toEqual([]);
  });

  test("error interceptors can rewrite HTTP errors", async () => {
    const client = make();
    client.interceptors.error.use((error, response) => ({
      wrapped: error,
      status: response?.status,
    }));
    expect((await client.get({ url: "/err-json" })).error).toEqual({
      wrapped: { code: 500 },
      status: 500,
    });
  });

  test("network failures go through error interceptors", async () => {
    const failing = createClient({
      baseUrl: "http://stub.test",
      fetch: (async () => {
        throw new Error("offline");
      }) as typeof fetch,
    });
    failing.interceptors.error.use(
      (error) => new Error(`wrapped: ${(error as Error).message}`),
    );
    const result = await failing.get({ url: "/x" });
    expect((result.error as Error).message).toBe("wrapped: offline");
    await expect(
      failing.get({ url: "/x", throwOnError: true }),
    ).rejects.toThrow("wrapped: offline");
  });

  test("Interceptors helper accepts function ids", () => {
    const interceptors = new Interceptors<() => void>();
    const fn = () => {};
    interceptors.use(fn);
    expect(interceptors.exists(fn)).toBe(true);
    interceptors.eject(fn);
    expect(interceptors.exists(fn)).toBe(false);
  });
});

describe("fetch runtime: security", () => {
  const echoHeaders = async (
    config: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => {
    const { data } = await make(config).get({ url: "/echo", ...options });
    return data as { headers: Record<string, string>; search: string };
  };

  test("bearer and basic schemes", async () => {
    expect(
      (
        await echoHeaders(
          { auth: "tok" },
          { security: [{ scheme: "bearer", type: "http" }] },
        )
      ).headers.authorization,
    ).toBe("Bearer tok");
    expect(
      (
        await echoHeaders(
          { auth: () => "user:pw" },
          { security: [{ scheme: "basic", type: "http" }] },
        )
      ).headers.authorization,
    ).toBe(`Basic ${btoa("user:pw")}`);
  });

  test("api keys in header, query and cookie", async () => {
    expect(
      (
        await echoHeaders(
          { auth: async () => "k" },
          { security: [{ in: "header", name: "X-Key", type: "apiKey" }] },
        )
      ).headers["x-key"],
    ).toBe("k");
    expect(
      (
        await echoHeaders(
          { auth: "k" },
          { security: [{ in: "query", name: "key", type: "apiKey" }] },
        )
      ).search,
    ).toBe("?key=k");
    const cookie = { in: "cookie", name: "sid", type: "apiKey" };
    expect(
      (await echoHeaders({ auth: "abc" }, { security: [cookie] })).headers
        .cookie,
    ).toBe("sid=abc");
  });

  test("skips schemes without a token and tries the next one", async () => {
    const echoed = await echoHeaders(
      {
        auth: (auth: { type: string }) =>
          auth.type === "apiKey" ? "second" : undefined,
      },
      {
        security: [
          { scheme: "bearer", type: "http" },
          { in: "header", name: "X-Key", type: "apiKey" },
        ],
      },
    );
    expect(echoed.headers.authorization).toBeUndefined();
    expect(echoed.headers["x-key"]).toBe("second");
    expect(
      (
        await echoHeaders(
          {},
          { security: [{ scheme: "bearer", type: "http" }] },
        )
      ).headers.authorization,
    ).toBeUndefined();
  });
});
