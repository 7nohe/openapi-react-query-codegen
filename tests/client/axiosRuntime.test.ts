import http from "node:http";
import type { AddressInfo } from "node:net";
import axios, { AxiosError } from "axios";
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
    // As in v3, the header the SDK asked for stays without a body too.
    expect(echo(empty).headers["content-type"]).toBe("application/json");
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
    expect(headers["x-list"]).toBe("a, b");
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
    expect(fromStatic.instance).not.toBe(axios);
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

describe("axios runtime: responseTransformer", () => {
  test("turns the data of a successful response into what it returns", async () => {
    const client = make();
    const result = await client.get({
      url: "/a",
      responseTransformer: async (data) => ({
        path: (data as Echo).path.toUpperCase(),
      }),
    });
    expect(result.data).toEqual({ path: "/A" });
    expect(result.status).toBe(200);
    // Not an axios setting, so axios is not handed it.
    expect(result.config).not.toHaveProperty("responseTransformer");
  });

  test("is not called for an error", async () => {
    let calls = 0;
    const result = await make().get({
      url: "/err-json",
      responseTransformer: () => {
        calls += 1;
      },
    });
    expect(calls).toBe(0);
    expect(result.error).toEqual({ code: 500 });
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
    // The caller's header keeps its cookies however its name is written.
    for (const name of ["cookie", "COOKIE"]) {
      const sid = { in: "cookie", name: "sid", type: "apiKey" };
      expect(
        (
          await headersFor(
            { auth: "k", headers: { [name]: "a=1" } },
            { security: [sid] },
          )
        ).headers.cookie,
      ).toBe("a=1; sid=k");
      expect(
        (
          await headersFor(
            { auth: "k" },
            { security: [sid], headers: { [name]: "a=1" } },
          )
        ).headers.cookie,
      ).toBe("a=1; sid=k");
    }
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

  test("a failure without throwOnError stays an AxiosError", async () => {
    const client = createClient({
      baseURL,
      adapter: (config) =>
        Promise.reject(new AxiosError("Network Error", "ERR_NETWORK", config)),
    } as never);
    const result = (await client.get({
      url: "/echo",
    })) as unknown as AxiosError & {
      error: unknown;
    };
    expect(result).toBeInstanceOf(AxiosError);
    expect(result.toJSON()).toMatchObject({ message: "Network Error" });
    expect(result.error).toBe(result);
  });

  test("a failure with a response puts its body in error", async () => {
    const result = await make().get({ url: "/err-json" });
    expect(result.data).toBeUndefined();
    expect(result.error).toEqual({ code: 500 });
    expect((result as unknown as AxiosError).response?.status).toBe(500);
  });

  test("an API key the caller supplies wins over the token", async () => {
    const client = make();
    client.setConfig({ auth: "global" });
    const header = { in: "header", name: "X-Key", type: "apiKey" } as const;
    const sent = echo(
      await client.get({
        url: "/echo",
        security: [header],
        headers: { "x-key": "mine" },
      }),
    );
    expect(sent.headers["x-key"]).toBe("mine");
    expect(
      echo(await client.get({ url: "/echo", security: [header] })).headers[
        "x-key"
      ],
    ).toBe("global");
    const query = { in: "query", name: "key", type: "apiKey" } as const;
    const inQuery = echo(
      await client.get({
        url: "/echo",
        security: [query],
        query: { key: "mine" },
      }),
    );
    expect(inQuery.search).toBe("?key=mine");
    const cookie = { in: "cookie", name: "key", type: "apiKey" } as const;
    const withCookie = echo(
      await client.get({
        url: "/echo",
        security: [cookie],
        headers: { Cookie: "a=1; key=mine" },
      }),
    );
    expect(withCookie.headers.cookie).toBe("a=1; key=mine");
    const otherCookie = echo(
      await client.get({
        url: "/echo",
        security: [cookie],
        headers: { Cookie: "monkey=1" },
      }),
    );
    expect(otherCookie.headers.cookie).toBe("monkey=1; key=global");
  });

  test("a paramsSerializer on the client is used", async () => {
    const client = make();
    client.setConfig({
      paramsSerializer: { serialize: () => "ids[]=1&ids[]=2" },
    } as never);
    const sent = echo(
      await client.get({ url: "/echo", query: { ids: [1, 2] } }),
    );
    expect(decodeURIComponent(sent.search)).toBe("?ids[]=1&ids[]=2");
  });

  test("a paramsSerializer on the axios instance is used", async () => {
    const instance = axios.create({
      paramsSerializer: { serialize: () => "from=instance" },
    });
    const sent = echo(
      await createClient({ baseURL, axios: instance } as never).get({
        url: "/echo",
        query: { a: 1 },
      }),
    );
    expect(sent.search).toBe("?from=instance");
  });

  test("bodySerializer null sends a serialized body as it is", async () => {
    const sent = echo(
      await make().post({
        url: "/echo",
        body: '{"x":1}',
        bodyType: "json",
        bodySerializer: null,
      }),
    );
    expect(sent.body).toBe('{"x":1}');
  });

  test("clients given the default export keep their interceptors apart", async () => {
    const a = createClient({ baseURL, axios } as never);
    const b = createClient({ baseURL, axios } as never);
    expect(a.instance).not.toBe(axios);
    expect(a.instance).not.toBe(b.instance);
    a.instance.interceptors.request.use((config) => {
      config.headers.set("X-Client", "a");
      return config;
    });
    expect(echo(await a.get({ url: "/echo" })).headers["x-client"]).toBe("a");
    expect(
      echo(await b.get({ url: "/echo" })).headers["x-client"],
    ).toBeUndefined();
  });

  test("false suppresses a header instead of sending it", async () => {
    const client = createClient({
      baseURL,
      headers: { "User-Agent": false },
    } as never);
    const sent = echo(await client.get({ url: "/echo" }));
    expect(sent.headers["user-agent"]).toBeUndefined();
  });

  test("throwOnError left undefined falls back to the client's", async () => {
    const client = make();
    client.setConfig({ throwOnError: true });
    await expect(
      client.get({ url: "/err-json", throwOnError: undefined }),
    ).rejects.toBeInstanceOf(AxiosError);
  });

  test("allowReserved leaves reserved characters in values", () => {
    expect(serializeQuery({ q: "a/b:c" }, { allowReserved: true })).toBe(
      "q=a/b:c",
    );
  });

  test("a header left undefined keeps the configured value", async () => {
    const client = make();
    client.setConfig({ headers: { "X-Tenant": "acme" } });
    const sent = echo(
      await client.get({ url: "/echo", headers: { "x-tenant": undefined } }),
    );
    expect(sent.headers["x-tenant"]).toBe("acme");
  });

  test("the instance defaults follow the config", async () => {
    const client = createClient({ baseURL: "https://x.test" });
    expect(client.instance.defaults.baseURL).toBe("https://x.test");
    client.setConfig({
      baseURL,
      headers: { "X-Tenant": "acme", "X-Old": "1", common: { "X-All": "a" } },
      timeout: 1234,
    });
    client.setConfig({ headers: { "X-Old": null } });
    expect(client.instance.defaults.baseURL).toBe(baseURL);
    expect(client.instance.defaults.timeout).toBe(1234);
    expect(client.instance.defaults.headers["X-Old"]).toBeUndefined();
    expect(client.instance.defaults.headers.common.Accept).toBeDefined();

    const direct = (await client.instance.get("/echo")).data as Echo;
    expect(direct.headers["x-tenant"]).toBe("acme");
    expect(direct.headers["x-all"]).toBe("a");
    expect(direct.headers["x-old"]).toBeUndefined();

    // A request can still take a configured header away.
    const sent = echo(
      await client.get({ url: "/echo", headers: { "x-tenant": null } }),
    );
    expect(sent.headers["x-tenant"]).toBeUndefined();
    expect(sent.headers["x-all"]).toBe("a");
  });

  test("an instance of the caller's keeps its defaults until setConfig", () => {
    const instance = axios.create({ baseURL: "https://mine.test" });
    const client = createClient({
      axios: instance,
      baseURL: "https://x.test",
    } as never);
    expect(instance.defaults.baseURL).toBe("https://mine.test");
    client.setConfig({ baseURL: "https://y.test" });
    expect(instance.defaults.baseURL).toBe("https://y.test");
  });

  test("request interceptors can read meta", async () => {
    const instance = axios.create({ baseURL });
    let seen: unknown;
    instance.interceptors.request.use((config) => {
      seen = (config as unknown as { meta: unknown }).meta;
      return config;
    });
    await createClient({ axios: instance } as never).get({
      url: "/echo",
      meta: { traceId: "abc" },
    } as never);
    expect(seen).toEqual({ traceId: "abc" });
  });

  test("buildUrl falls back to the base URL of the axios instance", () => {
    const instance = axios.create({ baseURL: "https://example.test/api" });
    const client = createClient({ axios: instance } as never);
    expect(client.buildUrl({ url: "/pets", query: { limit: 5 } })).toBe(
      "https://example.test/api/pets?limit=5",
    );
    expect(client.buildUrl({ url: "/pets", baseURL: "" })).toBe("/pets");
  });

  test("headers grouped by method keep their structure", async () => {
    const client = make();
    client.setConfig({
      headers: { common: { "X-Common": "a" }, get: { "X-Get": "b" } },
    });
    client.setConfig({ headers: { common: { "X-More": "c" } } });
    const sent = echo(await client.get({ url: "/echo" }));
    expect(sent.headers["x-common"]).toBe("a");
    expect(sent.headers["x-more"]).toBe("c");
    expect(sent.headers["x-get"]).toBe("b");
    const posted = echo(await client.post({ url: "/echo", body: {} }));
    expect(posted.headers["x-get"]).toBeUndefined();
  });

  test("a failing auth callback does not reject without throwOnError", async () => {
    const security = [{ scheme: "bearer", type: "http" }] as const;
    const client = make();
    client.setConfig({
      auth: async () => {
        throw new Error("refresh failed");
      },
    });
    const result = await client.get({ url: "/echo", security });
    expect((result.error as Error).message).toBe("refresh failed");
    await expect(
      client.get({ url: "/echo", security, throwOnError: true }),
    ).rejects.toThrow("refresh failed");
  });

  test("a multipart request drops a configured Content-Type", async () => {
    const client = make();
    client.setConfig({ headers: { "Content-Type": "application/json" } });
    const sent = echo(
      await client.post({
        url: "/echo",
        body: { a: "b" },
        bodyType: "form-data",
        headers: { "Content-Type": null },
      }),
    );
    expect(sent.headers["content-type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );
  });

  test("a custom serializer may return a leading question mark", async () => {
    const options = {
      url: "/echo",
      query: { page: 2 },
      querySerializer: () => "?page=2",
    };
    expect(make().buildUrl(options).slice(baseURL.length)).toBe("/echo?page=2");
    expect(echo(await make().get(options)).search).toBe("?page=2");
  });

  test("buildUrl uses the configured serializers", () => {
    const client = make();
    client.setConfig({
      pathSerializer: { parameters: { id: { style: "label" } } },
      querySerializer: () => "custom=1",
    });
    expect(
      client
        .buildUrl({ url: "/a/{id}", path: { id: 1 }, query: { b: 2 } })
        .slice(baseURL.length),
    ).toBe("/a/.1?custom=1");
  });

  test("a parameter marked as JSON sends null as a JSON text", async () => {
    const options = {
      url: "/echo/{id}",
      path: { id: null },
      pathSerializer: { parameters: { id: { json: true } } },
      query: { filter: null, other: null },
      querySerializer: { parameters: { filter: { json: true } } },
    };
    expect(make().buildUrl(options).slice(baseURL.length)).toBe(
      "/echo/null?filter=null",
    );
    const sent = echo(await make().get(options));
    expect(sent.path).toBe("/echo/null");
    expect(sent.search).toBe("?filter=null");
  });

  test("a header marked as JSON is sent as a JSON text", async () => {
    const sent = echo(
      await make().get({
        url: "/echo",
        jsonHeaders: ["X-F", "X-N", "X-Missing"],
        headers: { "X-F": ["a", "b"], "X-N": null, "X-T": ["c"] },
      }),
    );
    expect(sent.headers["x-f"]).toBe('["a","b"]');
    expect(sent.headers["x-n"]).toBe("null");
    expect(sent.headers["x-t"]).toBe("c");
    expect(sent.headers["x-missing"]).toBeUndefined();
  });

  test("a parameter marked as JSON is sent as a JSON text", () => {
    const url = make()
      .buildUrl({
        url: "/x/{id}",
        path: { id: { a: 1 } },
        pathSerializer: { parameters: { id: { json: true } } },
        query: { filter: { a: [1] } },
        querySerializer: { parameters: { filter: { json: true } } },
      })
      .slice(baseURL.length);
    expect(decodeURIComponent(url)).toBe('/x/{"a":1}?filter={"a":[1]}');
  });

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
