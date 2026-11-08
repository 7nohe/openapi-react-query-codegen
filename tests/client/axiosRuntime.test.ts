import http from "node:http";
import type { AddressInfo } from "node:net";
import axios from "axios";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createClient,
  createConfig,
  serializeQuery,
} from "../../src/client/runtime/axios.runtime.ts";

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/err-json") {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ code: 500 }));
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        method: req.method,
        path: url.pathname,
        search: url.search,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf-8"),
      }),
    );
  });
});

let baseURL: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseURL = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const make = (config = {}) =>
  createClient(createConfig({ baseURL, ...config }));
type Echo = {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: string;
};
const echo = (result: { data?: unknown }) => result.data as Echo;

describe("axios runtime: requests", () => {
  test("every verb sends its method", async () => {
    const client = make();
    for (const verb of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "options",
    ] as const) {
      expect(echo(await client[verb]({ url: "/echo" })).method).toBe(
        verb.toUpperCase(),
      );
    }
    expect((await client.head({ url: "/echo" })).status).toBe(200);
    for (const verb of ["trace", "connect"] as const) {
      expect(client[verb]).toBeTypeOf("function");
    }
  });

  test("substitutes path parameters and serializes the query", async () => {
    const result = await make().get({
      url: "/items/{id}/{tags}",
      path: { id: "a b", tags: ["x", "y"] },
      query: { a: 1, b: [1, 2], c: null, deep: { k: "v" } },
    });
    expect(echo(result).path).toBe("/items/a%20b/x,y");
    expect(decodeURIComponent(echo(result).search)).toBe(
      "?a=1&b=1&b=2&deep[k]=v",
    );
    const custom = await make().get({
      url: "/echo",
      query: { a: 1 },
      querySerializer: (query) => `x=${Object.keys(query).join(",")}`,
    });
    expect(echo(custom).search).toBe("?x=a");
    expect(
      serializeQuery(
        { ids: [1, 2] },
        { parameters: { ids: { array: { style: "form", explode: false } } } },
      ),
    ).toBe("ids=1,2");
  });

  test("serializes bodies", async () => {
    const client = make();
    const json = await client.post({
      url: "/echo",
      body: { a: 1 },
      bodyType: "json",
    });
    expect(echo(json).body).toBe('{"a":1}');
    expect(echo(json).headers["content-type"]).toBe("application/json");
    const keep = await client.post({
      url: "/echo",
      body: { a: 1 },
      bodyType: "json",
      headers: { "content-type": "application/vnd.api+json" },
    });
    expect(echo(keep).headers["content-type"]).toBe("application/vnd.api+json");
    const urlencoded = await client.post({
      url: "/echo",
      bodyType: "urlencoded",
      body: { a: "1 2", list: [1, 2], skip: null },
    });
    expect(echo(urlencoded).body).toBe("a=1+2&list=1&list=2");
    const form = await client.post({
      url: "/echo",
      bodyType: "form-data",
      body: {
        a: "1",
        list: ["x"],
        blob: new Blob(["b"]),
        d: new Date(0),
        o: { k: 1 },
        n: 2,
        skip: undefined,
      },
    });
    expect(echo(form).body).toContain('name="a"');
    expect(echo(form).body).toContain('{"k":1}');
    const passthrough = new FormData();
    passthrough.append("z", "1");
    expect(
      echo(
        await client.post({
          url: "/echo",
          bodyType: "form-data",
          body: passthrough,
        }),
      ).body,
    ).toContain('name="z"');
    expect(
      echo(
        await client.post({
          url: "/echo",
          bodyType: "urlencoded",
          body: new URLSearchParams({ q: "1" }),
        }),
      ).body,
    ).toBe("q=1");
    const custom = await client.post({
      url: "/echo",
      body: { a: 1 },
      bodySerializer: () => "serialized",
      headers: { "Content-Type": "text/plain" },
    });
    expect(echo(custom).body).toBe("serialized");
    const empty = await client.post({
      url: "/echo",
      headers: { "Content-Type": "application/json" },
    });
    expect(echo(empty).headers["content-type"]).not.toBe("application/json");
  });

  test("merges headers case-insensitively", async () => {
    const client = make({
      headers: {
        "X-Base": "base",
        "X-Drop": "drop",
        "X-Obj": { a: 1 },
        "X-Skip": undefined,
      },
    });
    const result = await client.get({
      url: "/echo",
      headers: {
        "x-base": "override",
        "X-Drop": null,
        "X-List": ["a", "b"],
        "X-Num": 2,
      },
    });
    const headers = echo(result).headers;
    expect(headers["x-base"]).toBe("override");
    expect(headers["x-drop"]).toBeUndefined();
    expect(headers["x-list"]).toBe("a,b");
    expect(headers["x-num"]).toBe("2");
    expect(headers["x-obj"]).toBe('{"a":1}');
  });

  test("buildUrl and setConfig", () => {
    const client = createClient({ baseURL: "https://x.test/api/" });
    expect(client.buildUrl({ url: "pets", query: { a: 1 } })).toBe(
      "https://x.test/api/pets?a=1",
    );
    expect(
      client.buildUrl({ url: "https://other.test/a?x=1", query: { y: 2 } }),
    ).toBe("https://other.test/a?x=1&y=2");
    expect(
      client.buildUrl({
        url: "/a",
        baseURL: "http://b.test",
        querySerializer: () => "",
      }),
    ).toBe("http://b.test/a");
    expect(client.buildUrl({ url: "", baseURL: "" })).toBe("");
    const next = client.setConfig({
      baseURL: "https://y.test",
      headers: { "X-A": "a" },
    });
    expect(next.baseURL).toBe("https://y.test");
    expect(client.getConfig().headers).toEqual({ "X-A": "a" });
    expect(client.setConfig({ timeout: 5 }).baseURL).toBe("https://y.test");
    expect(client.buildUrl({ url: "/z" })).toBe("https://y.test/z");
  });

  test("accepts an axios static or an instance", async () => {
    const fromStatic = createClient({ baseURL, axios });
    expect(fromStatic.instance).toBe(axios);
    expect(echo(await fromStatic.get({ url: "/echo" })).method).toBe("GET");
    const instance = axios.create();
    const fromInstance = createClient({ baseURL, axios: instance });
    expect(fromInstance.instance).toBe(instance);
    const viaOption = await make().get({ url: "/echo", axios: instance });
    expect(echo(viaOption).method).toBe("GET");
  });

  test("passes unknown options through to axios", async () => {
    const result = await make().get({ url: "/echo", responseType: "text" });
    expect(typeof result.data).toBe("string");
  });
});

describe("axios runtime: errors", () => {
  test("returns the response data as error unless throwOnError is set", async () => {
    const client = make();
    const result = await client.get({ url: "/err-json" });
    expect(result.error).toEqual({ code: 500 });
    expect(result.data).toBeUndefined();
    await expect(
      client.get({ url: "/err-json", throwOnError: true }),
    ).rejects.toMatchObject({
      isAxiosError: true,
      response: { status: 500 },
    });
  });

  test("network failures fall back to the axios error", async () => {
    const client = createClient({ baseURL: "http://127.0.0.1:1" });
    const result = await client.get({ url: "/x" });
    expect((result.error as { isAxiosError?: boolean }).isAxiosError).toBe(
      true,
    );
  });
});

describe("axios runtime: security", () => {
  const headersFor = async (
    config: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => echo(await make(config).get({ url: "/echo", ...options }));

  test("bearer and basic schemes", async () => {
    expect(
      (
        await headersFor(
          { auth: "tok" },
          { security: [{ scheme: "bearer", type: "http" }] },
        )
      ).headers.authorization,
    ).toBe("Bearer tok");
    expect(
      (
        await headersFor(
          { auth: async () => "u:p" },
          { security: [{ scheme: "basic", type: "http" }] },
        )
      ).headers.authorization,
    ).toBe(`Basic ${btoa("u:p")}`);
  });

  test("api keys in header, query and cookie", async () => {
    expect(
      (
        await headersFor(
          { auth: "k" },
          { security: [{ in: "header", name: "X-Key", type: "apiKey" }] },
        )
      ).headers["x-key"],
    ).toBe("k");
    expect(
      (
        await headersFor(
          { auth: "k" },
          { security: [{ in: "query", name: "key", type: "apiKey" }] },
        )
      ).search,
    ).toBe("?key=k");
    const cookies = await headersFor(
      { auth: "k", headers: { Cookie: "a=1" } },
      { security: [{ in: "cookie", name: "sid", type: "apiKey" }] },
    );
    expect(cookies.headers.cookie).toBe("a=1; sid=k");
    expect(
      (
        await headersFor(
          { auth: "k" },
          { security: [{ in: "cookie", name: "sid", type: "apiKey" }] },
        )
      ).headers.cookie,
    ).toBe("sid=k");
  });

  test("skips schemes without a token", async () => {
    const echoed = await headersFor(
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
  });
});

describe("axios runtime: JSON string bodies", () => {
  test.each(["true", "123", "null", '{"a":1}', "plain"])(
    "keeps %s a string",
    async (value) => {
      const { data } = await make().post<Echo>({
        url: "/echo",
        body: value,
        bodyType: "json",
      });
      expect(JSON.parse((data as unknown as Echo).body)).toBe(value);
    },
  );
});

describe("axios runtime: combined security requirements", () => {
  const a = { in: "header", name: "X-A", type: "apiKey" } as const;
  const b = { in: "header", name: "X-B", type: "apiKey" } as const;
  const send = async (auth: unknown, security: unknown) => {
    const { data } = await make({ auth }).get({
      url: "/echo",
      security,
    } as never);
    return data as unknown as Echo;
  };

  test("sends every scheme a requirement combines", async () => {
    const { headers } = await send("k", [[a, b]]);
    expect(headers["x-a"]).toBe("k");
    expect(headers["x-b"]).toBe("k");
  });

  test("skips a requirement that is missing a token", async () => {
    const auth = (scheme: { name?: string }) =>
      scheme.name === "X-B" ? undefined : "k";
    const { headers } = await send(auth, [[a, b], { ...a, name: "X-C" }]);
    expect(headers["x-a"]).toBeUndefined();
    expect(headers["x-c"]).toBe("k");
  });
});

describe("axios runtime: path parameter styles", () => {
  const path = (value: unknown, style: string, explode: boolean) =>
    make()
      .buildUrl({
        url: "/x/{id}",
        path: { id: value },
        pathSerializer: { parameters: { id: { style, explode } } },
      } as never)
      .slice(baseURL.length);

  test("serializes the style through buildUrl", () => {
    expect(path({ R: 1 }, "matrix", true)).toBe("/x/;R=1");
    expect(path([3, 4], "label", true)).toBe("/x/.3.4");
    expect(path({ R: 1 }, "simple", true)).toBe("/x/R=1");
  });

  test("uses the style for the request it sends", async () => {
    const { data } = await make().get<Echo>({
      url: "/echo/{id}",
      path: { id: { R: 1 } },
      pathSerializer: {
        parameters: { id: { style: "matrix", explode: true } },
      },
    });
    expect((data as unknown as Echo).path).toBe("/echo/;R=1");
  });
});
