// End to end: generate the client and the hooks with the real pipeline, then
// run the generated queryOptions / prefetch / ensureQueryData code against a
// local HTTP server, with both HTTP clients. Covers #172 (errors must reject).

import { rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { generate } from "../../src/generate.mjs";
import { inputPath } from "../utils";

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/pets" && req.method === "GET") {
    res.end(
      JSON.stringify([
        { id: 1, name: "Momo", tag: url.searchParams.get("limit") },
      ]),
    );
  } else if (url.pathname === "/paginated-pets") {
    const page = Number(url.searchParams.get("page") ?? "1");
    res.end(
      JSON.stringify({
        pets: [{ id: page, name: `p${page}` }],
        nextPage: page + 1,
      }),
    );
  } else if (url.pathname.startsWith("/pets/")) {
    res.statusCode = 500;
    res.end(JSON.stringify({ code: 500, message: "boom" }));
  } else {
    res.statusCode = 404;
    res.end("{}");
  }
});

let baseUrl: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

for (const client of ["fetch", "axios"] as const) {
  describe(`generated hooks over the ${client} client`, () => {
    const outputDir = path.join("tests", "client", `e2e-${client}-outputs`);
    const importDir = path.join(__dirname, `e2e-${client}-outputs`);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    beforeAll(async () => {
      await generate(
        {
          input: inputPath("petstore.yaml"),
          output: outputDir,
          client,
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

    test("queryOptions fetch real data", async () => {
      const { findPetsOptions } = await import(
        path.join(importDir, "queries", "queryOptions.ts")
      );
      const pets = await qc.fetchQuery(
        findPetsOptions({ query: { limit: 5 } }),
      );
      expect(pets?.[0]).toMatchObject({ name: "Momo", tag: "5" });
    });

    test("ensureQueryData resolves on success and caches", async () => {
      const { ensureUseFindPetsData } = await import(
        path.join(importDir, "queries", "ensureQueryData.ts")
      );
      const pets = await ensureUseFindPetsData(qc);
      expect(Array.isArray(pets)).toBe(true);
    });

    test("error responses reject instead of resolving undefined (#172)", async () => {
      const { ensureUseFindPetByIdData } = await import(
        path.join(importDir, "queries", "ensureQueryData.ts")
      );
      await expect(
        ensureUseFindPetByIdData(qc, { path: { id: 999 } }, { retry: false }),
      ).rejects.toBeTruthy();
      expect(qc.getQueryData(["FindPetById", { path: { id: 999 } }])).toBe(
        undefined,
      );
    });

    test("infinite queries page through the API", async () => {
      const { prefetchUseFindPaginatedPetsInfinite } = await import(
        path.join(importDir, "queries", "prefetch.ts")
      );
      await prefetchUseFindPaginatedPetsInfinite(qc);
      const common = await import(path.join(importDir, "queries", "common.ts"));
      const data = qc.getQueryData(
        common.UseFindPaginatedPetsInfiniteKeyFn(),
      ) as {
        pages: Array<{ pets: Array<{ id: number }> }>;
      };
      expect(data.pages[0].pets[0].id).toBe(1);
    });
  });
}
