// Runtime verification of the generated code against a live HTTP server.
// Runs in CI after `generate:api` — exercises #172 (error responses reject),
// #155 (prefetchInfiniteQuery), #174 (hierarchical key invalidation), and
// the queryOptions factories with real requests, not just type checks.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { QueryClient } from "@tanstack/react-query";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  UseFindPaginatedPetsInfiniteKeyFn,
  useFindPaginatedPetsKey,
} from "./openapi/queries/common";
import {
  ensureUseFindPetByIdData,
  ensureUseFindPetsData,
} from "./openapi/queries/ensureQueryData";
import { prefetchUseFindPaginatedPetsInfinite } from "./openapi/queries/prefetch";
import {
  findPaginatedPetsInfiniteOptions,
  findPetsOptions,
} from "./openapi/queries/queryOptions";
import { client } from "./openapi/requests/client.gen";

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/pets") {
    res.end(JSON.stringify([{ id: 1, name: "Momo", tag: "cat" }]));
    return;
  }
  if (url.pathname === "/paginated-pets") {
    const page = Number(url.searchParams.get("page") ?? "1");
    res.end(
      JSON.stringify({
        pets: [{ id: page, name: `pet-page-${page}` }],
        nextPage: page + 1,
      }),
    );
    return;
  }
  if (url.pathname.startsWith("/pets/")) {
    res.statusCode = 500;
    res.end(JSON.stringify({ code: 500, message: "boom" }));
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  // Deliberately NO throwOnError here — the generated code must set it per call
  client.setConfig({ baseUrl: `http://localhost:${port}` });
});

afterAll(() => server.close());

test("queryOptions factory fetches real data via fetchQuery", async () => {
  const pets = await qc.fetchQuery(findPetsOptions());
  expect(pets?.[0]?.name).toBe("Momo");
});

test("ensureQueryData resolves data on success", async () => {
  const pets = await ensureUseFindPetsData(qc);
  expect(Array.isArray(pets)).toBe(true);
});

test("#172: error responses reject instead of resolving undefined", async () => {
  await expect(
    ensureUseFindPetByIdData(qc, { path: { id: 999 } }, { retry: false }),
  ).rejects.toBeTruthy();
  // and nothing bogus was cached
  expect(qc.getQueryData(["FindPetById", { path: { id: 999 } }])).toBe(
    undefined,
  );
});

test("#155: prefetchInfiniteQuery caches page 1 under the hierarchical key with a numeric pageParam", async () => {
  await prefetchUseFindPaginatedPetsInfinite(qc, { query: { limit: 1 } });
  const key = UseFindPaginatedPetsInfiniteKeyFn({ query: { limit: 1 } });
  expect(key.slice(0, 2)).toEqual(["FindPaginatedPets", "infinite"]);
  const cached = qc.getQueryData<{
    pages: Array<{ pets?: Array<{ name?: string }> }>;
    pageParams: unknown[];
  }>(key);
  expect(cached?.pages).toHaveLength(1);
  expect(cached?.pages[0]?.pets?.[0]?.name).toBe("pet-page-1");
  expect(cached?.pageParams[0]).toBe(1);
});

test("infiniteQueryOptions factory follows nextPage across two pages", async () => {
  const result = await qc.fetchInfiniteQuery({
    ...findPaginatedPetsInfiniteOptions({ query: { limit: 2 } }),
    pages: 2,
  });
  expect(result.pages).toHaveLength(2);
  expect(result.pages[1]?.pets?.[0]?.name).toBe("pet-page-2");
  expect(result.pageParams).toEqual([1, 2]);
});

test("#174: invalidating the plain key prefix marks infinite entries stale", async () => {
  const key = UseFindPaginatedPetsInfiniteKeyFn({ query: { limit: 1 } });
  expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
  await qc.invalidateQueries({ queryKey: [useFindPaginatedPetsKey] });
  expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
});
