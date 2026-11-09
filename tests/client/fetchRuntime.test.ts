import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  type Auth,
  createClient,
  createConfig,
  Interceptors,
  type ParseAs,
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
    expect(client.buildUrl({ url: "/a", baseUrl: "", query: {} })).toBe("/a");
    expect(client.buildUrl({ url: "", baseUrl: "" })).toBe("");
  });

  test("a custom serializer may return a leading question mark", () => {
    const url = createClient({ baseUrl: "https://x.test" }).buildUrl({
      url: "/a",
      query: { page: 2 },
      querySerializer: () => "?page=2",
    });
    expect(url).toBe("https://x.test/a?page=2");
  });

  test("buildUrl uses the configured serializers", () => {
    const client = createClient({
      baseUrl: "https://x.test",
      pathSerializer: { parameters: { id: { style: "label" } } },
      querySerializer: () => "custom=1",
    });
    expect(
      client.buildUrl({ url: "/a/{id}", path: { id: 1 }, query: { b: 2 } }),
    ).toBe("https://x.test/a/.1?custom=1");
  });

  test("an empty body is never undefined", async () => {
    const respond = (headers: Record<string, string>) =>
      (async () =>
        new Response(null, { status: 204, headers })) as typeof fetch;
    const read = async (parseAs: ParseAs, type?: string) =>
      (
        await createClient({
          baseUrl: "https://x.test",
          fetch: respond(type ? { "Content-Type": type } : {}),
        }).get({ url: "/a", parseAs })
      ).data;
    expect(await read("auto")).toBe(null);
    expect(await read("json")).toEqual({});
    expect(await read("text")).toBe("");
    expect(await read("auto", "text/plain")).toBe("");
    expect(await read("formData")).toBeInstanceOf(FormData);
    expect(await read("blob")).toBeInstanceOf(Blob);
  });

  test("a multipart request drops a configured Content-Type", async () => {
    let seen: Request | undefined;
    const client = createClient({
      baseUrl: "https://x.test",
      headers: { "Content-Type": "application/json" },
      fetch: (async (request: Request) => {
        seen = request;
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    await client.post({
      url: "/a",
      body: { a: "b" },
      bodyType: "form-data",
      headers: { "Content-Type": null },
    });
    expect(seen?.headers.get("Content-Type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
  });

  describe("an API key the caller supplies", () => {
    const send = async (
      security: Auth,
      options: { headers?: Record<string, string>; query?: object },
    ) => {
      let seen: Request | undefined;
      await createClient({
        baseUrl: "https://x.test",
        auth: "global",
        fetch: (async (request: Request) => {
          seen = request;
          return new Response(null, { status: 204 });
        }) as typeof fetch,
      }).get({ url: "/a", security: [security], ...options } as never);
      return seen as unknown as Request;
    };

    test("wins in a header, whatever its case", async () => {
      const auth: Auth = { in: "header", name: "X-Key", type: "apiKey" };
      const sent = await send(auth, { headers: { "x-key": "mine" } });
      expect(sent.headers.get("X-Key")).toBe("mine");
      expect((await send(auth, {})).headers.get("X-Key")).toBe("global");
    });

    test("wins in the query", async () => {
      const auth: Auth = { in: "query", name: "key", type: "apiKey" };
      const sent = await send(auth, { query: { key: "mine" } });
      expect(new URL(sent.url).searchParams.get("key")).toBe("mine");
    });

    test("wins in a cookie, and another cookie does not count", async () => {
      const auth: Auth = { in: "cookie", name: "key", type: "apiKey" };
      const mine = await send(auth, { headers: { Cookie: "a=1; key=mine" } });
      expect(mine.headers.get("Cookie")).toBe("a=1; key=mine");
      const other = await send(auth, { headers: { Cookie: "monkey=1" } });
      expect(other.headers.get("Cookie")).toBe("monkey=1; key=global");
    });

    test("does not stand in for a scheme it does not name", async () => {
      const auth: Auth = { scheme: "bearer", type: "http" };
      const sent = await send(auth, { headers: { Authorization: "mine" } });
      expect(sent.headers.get("Authorization")).toBe("Bearer global");
    });

    test("leaves the other scheme of a requirement to the token", async () => {
      let seen: Request | undefined;
      await createClient({
        baseUrl: "https://x.test",
        auth: "global",
        fetch: (async (request: Request) => {
          seen = request;
          return new Response(null, { status: 204 });
        }) as typeof fetch,
      }).get({
        url: "/a",
        headers: { "X-A": "mine" },
        security: [
          [
            { in: "header", name: "X-A", type: "apiKey" },
            { in: "header", name: "X-B", type: "apiKey" },
          ],
        ],
      });
      expect(seen?.headers.get("X-A")).toBe("mine");
      expect(seen?.headers.get("X-B")).toBe("global");
    });
  });

  test("an object sent without a bodyType says it is JSON", async () => {
    const seen: Array<string | null> = [];
    const client = createClient({
      baseUrl: "https://x.test",
      fetch: (async (request: Request) => {
        seen.push(request.headers.get("Content-Type"));
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    await client.post({ url: "/a", body: { hello: "world" } });
    await client.post({ url: "/a", body: "text" });
    await client.post({ url: "/a", body: new Blob(["x"]) });
    await client.post({
      url: "/a",
      body: { a: 1 },
      bodySerializer: () => "a=1",
    });
    expect(seen[0]).toBe("application/json");
    expect(seen[1]).toBe("text/plain;charset=UTF-8");
    expect(seen[2]).toBeNull();
    expect(seen[3]).toBe("text/plain;charset=UTF-8");
  });

  test("a file sent to a JSON operation stays a file", async () => {
    let seen = "";
    const client = createClient({
      baseUrl: "https://x.test",
      fetch: (async (request: Request) => {
        seen = await request.text();
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    await client.post({
      url: "/a",
      body: new Blob(['{"pets":[]}']),
      bodyType: "json",
    });
    expect(seen).toBe('{"pets":[]}');
  });

  test("bodySerializer null sends a serialized body as it is", async () => {
    let seen = "";
    const client = createClient({
      baseUrl: "https://x.test",
      fetch: (async (request: Request) => {
        seen = await request.text();
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    await client.post({
      url: "/a",
      body: '{"x":1}',
      bodyType: "json",
      bodySerializer: null,
    });
    expect(seen).toBe('{"x":1}');
  });

  test("interceptors see the merged headers", async () => {
    const seen: Array<string | null> = [];
    const client = createClient({
      baseUrl: "https://x.test",
      headers: { "X-Tenant": "a" },
      fetch: (async () => new Response("{}")) as typeof fetch,
    });
    client.interceptors.request.use((request, options) => {
      seen.push(options.headers.get("X-Tenant"));
      return request;
    });
    client.interceptors.response.use((response, _request, options) => {
      seen.push(options.headers.get("X-Trace"));
      return response;
    });
    await client.get({ url: "/a", headers: { "X-Trace": "1" } });
    expect(seen).toEqual(["a", "1"]);
    expect(client.getConfig().headers).not.toBe(undefined);
    expect((client.getConfig().headers as Headers).has("X-Trace")).toBe(false);
  });

  test("the parser configured on the client applies", async () => {
    const client = createClient({
      baseUrl: "https://x.test",
      parseAs: "stream",
      fetch: (async () =>
        new Response("{}", {
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    expect((await client.get({ url: "/a" })).data).toBeInstanceOf(
      ReadableStream,
    );
  });

  test("update replaces an interceptor that is there", () => {
    const interceptors = new Interceptors<() => number>();
    const first = () => 1;
    const second = () => 2;
    const id = interceptors.use(first);
    expect(interceptors.update(id, second)).toBe(id);
    expect(interceptors.fns[id]).toBe(second);
    expect(interceptors.update(second, first)).toBe(second);
    expect(interceptors.fns[id]).toBe(first);
    expect(interceptors.update(99, second)).toBe(false);
    interceptors.eject(id);
    expect(interceptors.update(id, second)).toBe(false);
  });

  test("an auth callback can tell schemes apart by key", async () => {
    const tokens: Record<string, string> = { user: "u", admin: "a" };
    const seen: Array<string | null> = [];
    const client = createClient({
      baseUrl: "https://x.test",
      auth: (auth) => tokens[auth.key ?? ""],
      fetch: (async (request: Request) => {
        seen.push(request.headers.get("Authorization"));
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    for (const key of ["user", "admin"]) {
      await client.get({
        url: "/a",
        security: [{ key, scheme: "bearer", type: "http" }],
      });
    }
    expect(seen).toEqual(["Bearer u", "Bearer a"]);
  });

  test("allowReserved leaves reserved characters in values", () => {
    const query = { q: "a/b:c", "k/1": ["x/y"], o: { p: "c/d" } };
    expect(serializeQuery(query, { allowReserved: true })).toBe(
      "q=a/b:c&k%2F1=x/y&o[p]=c/d",
    );
    expect(
      serializeQuery(
        { a: "x/y", b: "x/y" },
        { parameters: { a: { allowReserved: true } } },
      ),
    ).toBe("a=x/y&b=x%2Fy");
  });

  test("options left undefined fall back to the client's", async () => {
    let calls = 0;
    const client = createClient({
      baseUrl: "https://x.test",
      throwOnError: true,
      fetch: (async () => {
        calls += 1;
        return new Response("{}", { status: 400 });
      }) as typeof fetch,
    });
    await expect(
      client.get({ url: "/a", throwOnError: undefined, fetch: undefined }),
    ).rejects.toEqual({});
    expect(calls).toBe(1);
  });

  test("exists is false for an interceptor that is not there", () => {
    const interceptors = new Interceptors<() => void>();
    expect(interceptors.exists(0)).toBe(false);
    const id = interceptors.use(() => {});
    expect(interceptors.exists(id)).toBe(true);
    interceptors.clear();
    expect(interceptors.exists(id)).toBe(false);
    expect(interceptors.exists(-1)).toBe(false);
  });

  describe("failures before the request is made", () => {
    const secured = () =>
      createClient({
        baseUrl: "https://x.test",
        fetch: (async () => new Response("{}")) as typeof fetch,
        auth: async () => {
          throw new Error("refresh failed");
        },
      });
    const security = [{ scheme: "bearer", type: "http" }] as const;

    test("a failing auth callback goes through the error path", async () => {
      const client = secured();
      let calls = 0;
      client.interceptors.error.use((error) => {
        calls += 1;
        return error;
      });
      const result = await client.get({ url: "/a", security });
      expect((result.error as Error).message).toBe("refresh failed");
      expect(calls).toBe(1);
      await expect(
        client.get({ url: "/a", security, throwOnError: true }),
      ).rejects.toThrow("refresh failed");
    });

    test("a failing body serializer goes through the error path", async () => {
      const client = createClient({ baseUrl: "https://x.test" });
      const result = await client.post({
        url: "/a",
        body: {},
        bodySerializer: () => {
          throw new Error("no");
        },
      });
      expect((result.error as Error).message).toBe("no");
    });
  });

  describe("failures after the request is made", () => {
    const failing = (body: string, type = "application/json") =>
      (async () =>
        new Response(body, {
          status: 200,
          headers: { "Content-Type": type },
        })) as typeof fetch;

    test("a body that cannot be parsed goes through the error path", async () => {
      const client = createClient({
        baseUrl: "https://x.test",
        fetch: failing("{bad"),
      });
      const seen: unknown[] = [];
      client.interceptors.error.use((error, response) => {
        seen.push(response?.status);
        return error;
      });
      const result = await client.get({ url: "/a" });
      expect(result.error).toBeInstanceOf(SyntaxError);
      expect(result.response.status).toBe(200);
      expect(seen).toEqual([200]);
      await expect(
        client.get({ url: "/a", throwOnError: true }),
      ).rejects.toBeInstanceOf(SyntaxError);
      expect(seen).toEqual([200, 200]);
    });

    test("an interceptor that throws goes through the error path", async () => {
      const client = createClient({
        baseUrl: "https://x.test",
        fetch: failing("{}"),
      });
      const boom = new Error("boom");
      const id = client.interceptors.response.use(() => {
        throw boom;
      });
      expect((await client.get({ url: "/a" })).error).toBe(boom);
      client.interceptors.response.eject(id);
      client.interceptors.request.use(() => {
        throw boom;
      });
      const result = await client.get({ url: "/a" });
      expect(result.error).toBe(boom);
      expect(result.response).toBeUndefined();
    });

    test("an error status runs the interceptors once", async () => {
      const client = createClient({
        baseUrl: "https://x.test",
        fetch: (async () =>
          new Response('{"code":1}', { status: 500 })) as typeof fetch,
      });
      let calls = 0;
      client.interceptors.error.use((error) => {
        calls += 1;
        return error;
      });
      await expect(
        client.get({ url: "/a", throwOnError: true }),
      ).rejects.toEqual({ code: 1 });
      expect(calls).toBe(1);
    });
  });

  test("buildUrl uses the configured base URL", () => {
    const client = createClient({ baseUrl: "https://x.test/api/" });
    expect(client.buildUrl({ url: "/a" })).toBe("https://x.test/api/a");
    client.setConfig({ baseUrl: "https://y.test" });
    expect(client.buildUrl({ url: "/z" })).toBe("https://y.test/z");
  });

  test("a parameter marked as JSON sends null as a JSON text", () => {
    const url = createClient().buildUrl({
      url: "/x/{id}",
      path: { id: null },
      pathSerializer: { parameters: { id: { json: true } } },
      query: { filter: null, other: null },
      querySerializer: { parameters: { filter: { json: true } } },
    });
    expect(url).toBe("/x/null?filter=null");
  });

  test("a header marked as JSON is sent as a JSON text", async () => {
    let seen: Headers | undefined;
    const client = createClient({
      baseUrl: "https://x.test",
      fetch: (async (request: Request) => {
        seen = request.headers;
        return new Response(null, { status: 204 });
      }) as typeof fetch,
      headers: { "X-Plain": "keep" },
    });
    await client.get({
      url: "/a",
      jsonHeaders: ["X-F", "X-N", "X-S", "X-Missing"],
      headers: { "X-F": ["a", "b"], "X-N": null, "X-S": "s", "X-T": ["c"] },
    });
    expect(seen?.get("X-F")).toBe('["a","b"]');
    expect(seen?.get("X-N")).toBe("null");
    expect(seen?.get("X-S")).toBe('"s"');
    expect(seen?.get("X-T")).toBe("c");
    expect(seen?.get("X-Plain")).toBe("keep");
    expect(seen?.has("X-Missing")).toBe(false);
  });

  test("JSON headers leave a Headers instance and a list alone", async () => {
    const seen: Headers[] = [];
    const client = createClient({
      baseUrl: "https://x.test",
      fetch: (async (request: Request) => {
        seen.push(request.headers);
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    for (const headers of [
      new Headers({ "X-F": "a" }),
      [["X-F", "a"]] as [string, string][],
    ]) {
      await client.get({ url: "/a", jsonHeaders: ["X-F"], headers });
    }
    expect(seen.map((item) => item.get("X-F"))).toEqual(["a", "a"]);
  });

  test("a parameter marked as JSON is sent as a JSON text", () => {
    const url = createClient().buildUrl({
      url: "/x/{id}",
      path: { id: { a: 1 } },
      pathSerializer: { parameters: { id: { json: true } } },
      query: { filter: { a: [1] } },
      querySerializer: { parameters: { filter: { json: true } } },
    });
    expect(decodeURIComponent(url)).toBe('/x/{"a":1}?filter={"a":[1]}');
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
    const quoted = await client.post({
      url: "/echo",
      body: "x",
      bodyType: "json",
    });
    expect((quoted.data as { body: string }).body).toBe('"x"');
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
    expect((await client.get({ url: "/empty" })).data).toBe(null);
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

describe("fetch runtime: combined security requirements", () => {
  const send = async (auth: unknown, security: unknown) => {
    const { data } = await make({ auth }).get({
      url: "/echo",
      security,
    } as never);
    return data as { headers: Record<string, string>; search: string };
  };
  const a = { in: "header", name: "X-A", type: "apiKey" };
  const b = { in: "header", name: "X-B", type: "apiKey" };

  test("sends every scheme a requirement combines", async () => {
    const { headers } = await send("k", [[a, b]]);
    expect(headers["x-a"]).toBe("k");
    expect(headers["x-b"]).toBe("k");
  });

  test("skips a requirement that is missing a token", async () => {
    const auth = (scheme: { name?: string }) =>
      scheme.name === "X-B" ? undefined : "k";
    const { headers } = await send(auth, [
      [a, b],
      { in: "header", name: "X-C", type: "apiKey" },
    ]);
    expect(headers["x-a"]).toBeUndefined();
    expect(headers["x-c"]).toBe("k");
  });

  test("applies each alternative that has a token, as v3 did", async () => {
    const { headers } = await send("k", [a, b]);
    expect(headers["x-a"]).toBe("k");
    expect(headers["x-b"]).toBe("k");
  });

  test("a token for one alternative leaves the other out", async () => {
    const { headers } = await send(
      (auth: Auth) => (auth.name === "X-B" ? "k" : undefined),
      [a, b],
    );
    expect(headers["x-a"]).toBeUndefined();
    expect(headers["x-b"]).toBe("k");
  });

  test("joins cookies with a semicolon", async () => {
    const { headers } = await send("k", [
      [
        { in: "cookie", name: "one", type: "apiKey" },
        { in: "cookie", name: "two", type: "apiKey" },
      ],
    ]);
    expect(headers.cookie).toBe("one=k; two=k");
  });
});

describe("fetch runtime: path parameter styles", () => {
  const url = (
    value: unknown,
    style?: "simple" | "label" | "matrix",
    explode?: boolean,
  ) =>
    make().buildUrl({
      url: "/x/{id}",
      path: { id: value },
      pathSerializer: { parameters: { id: { style, explode } } },
    } as never);
  const base = () => make().buildUrl({ url: "" });
  const tail = (value: string) => value.slice(base().length);
  const obj = { R: 100, G: 200 };

  test.each([
    [5, undefined, undefined, "/x/5"],
    [[3, 4], undefined, undefined, "/x/3,4"],
    [obj, undefined, undefined, "/x/R,100,G,200"],
    [obj, "simple", true, "/x/R=100,G=200"],
    [5, "label", false, "/x/.5"],
    [[3, 4], "label", false, "/x/.3,4"],
    [[3, 4], "label", true, "/x/.3.4"],
    [obj, "label", false, "/x/.R,100,G,200"],
    [obj, "label", true, "/x/.R=100.G=200"],
    [5, "matrix", false, "/x/;id=5"],
    [[3, 4], "matrix", false, "/x/;id=3,4"],
    [[3, 4], "matrix", true, "/x/;id=3;id=4"],
    [obj, "matrix", false, "/x/;id=R,100,G,200"],
    [obj, "matrix", true, "/x/;R=100;G=200"],
  ] as const)("%j as %s explode=%s", (value, style, explode, expected) => {
    expect(tail(url(value, style, explode))).toBe(expected);
  });

  test("encodes values and ignores null object members", () => {
    expect(tail(url({ a: "x y", b: null }, "matrix", true))).toBe(
      "/x/;a=x%20y",
    );
    expect(tail(url(new Date(0)))).toBe("/x/1970-01-01T00%3A00%3A00.000Z");
  });
});
