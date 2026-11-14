import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parse } from "yaml";
import { createMockServer } from "../examples/mock-server.mjs";

type Operation = { responses: Record<string, unknown> };
const spec: { paths: Record<string, Record<string, Operation>> } = parse(
  readFileSync(new URL("../examples/petstore.yaml", import.meta.url), "utf8"),
);
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.entries(item).map(
    ([method, operation]) => [method.toUpperCase(), path, operation] as const,
  ),
);

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  server = createMockServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("examples/mock-server.mjs", () => {
  test.each(operations)(
    "%s %s answers with a response the spec declares",
    async (method, path, operation) => {
      const response = await fetch(`${baseUrl}${path.replace("{id}", "1")}`, {
        ...(method === "POST" ? json({ name: "Rex" }) : {}),
        method,
      });
      const declared = Object.keys(operation.responses).filter(
        (status) => status !== "default",
      );
      if (declared.length > 0) {
        expect(declared).toContain(String(response.status));
      } else {
        // Only `default` is declared: any successful status fits.
        expect(response.ok).toBe(true);
      }
    },
  );

  test("lists pets, filtered by tags and cut to limit", async () => {
    const all = await (await fetch(`${baseUrl}/pets`)).json();
    expect(all).toHaveLength(25);
    expect(all[0]).toEqual({ id: 1, name: "Bella", tag: "dog" });

    const cats = await (
      await fetch(`${baseUrl}/pets?tags=cat&tags=bird&limit=3`)
    ).json();
    expect(cats.map((pet: { tag: string }) => pet.tag)).toEqual([
      "cat",
      "bird",
      "cat",
    ]);
  });

  test("keeps an added pet until it is deleted", async () => {
    const created = await fetch(`${baseUrl}/pets`, json({ name: "Rex" }));
    expect(await created.json()).toEqual({ id: 26, name: "Rex" });
    const listed = await (await fetch(`${baseUrl}/pets?limit=1`)).json();
    expect(listed).toEqual([{ id: 26, name: "Rex" }]);
    expect(await (await fetch(`${baseUrl}/pets/26`)).json()).toEqual({
      id: 26,
      name: "Rex",
    });

    const deleted = await fetch(`${baseUrl}/pets/26`, { method: "DELETE" });
    expect(deleted.status).toBe(204);
    const missing = await fetch(`${baseUrl}/pets/26`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      code: 404,
      message: "Pet 26 not found",
    });
  });

  test("pages through the pets and stops at the last page", async () => {
    const first = await (
      await fetch(`${baseUrl}/paginated-pets?limit=10`)
    ).json();
    expect(first.pets).toHaveLength(10);
    expect(first.nextPage).toBe(2);

    const last = await (
      await fetch(`${baseUrl}/paginated-pets?limit=10&page=3`)
    ).json();
    expect(last.pets).toHaveLength(5);
    expect(last).not.toHaveProperty("nextPage");
  });

  test("rejects a pet without a name and a limit that is not a number", async () => {
    const noName = await fetch(`${baseUrl}/pets`, json({ tag: "dog" }));
    expect(noName.status).toBe(400);
    expect(await noName.json()).toEqual({
      code: 400,
      message: "name is required",
    });
    expect((await fetch(`${baseUrl}/pets?limit=ten`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/unknown`)).status).toBe(404);
  });

  test("answers the browser's preflight request", async () => {
    const response = await fetch(`${baseUrl}/pets`, {
      method: "OPTIONS",
      headers: { "Access-Control-Request-Headers": "content-type" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );
  });
});
