// Mock Petstore API for the example apps (`npm run dev:mock`).
//
// Answers the operations of ./petstore.yaml from a list of pets kept in
// memory, on http://localhost:4010, with CORS open so the browser apps can
// call it. It has no dependencies. tests/examplesMockServer.test.ts checks
// that it answers every operation of the spec.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const names = [
  "Bella",
  "Max",
  "Luna",
  "Charlie",
  "Lucy",
  "Cooper",
  "Daisy",
  "Milo",
  "Zoe",
  "Rocky",
  "Lola",
  "Buddy",
  "Sadie",
  "Oscar",
  "Molly",
  "Toby",
  "Ruby",
  "Leo",
  "Rosie",
  "Jack",
  "Coco",
  "Finn",
  "Nala",
  "Otis",
  "Piper",
];
const tags = ["dog", "cat", "bird"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

/** Reads a non-negative integer query parameter; NaN when it is not one. */
function integerParam(url, name) {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return raw !== "" && Number.isInteger(value) && value >= 0
    ? value
    : Number.NaN;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Creates the server with its own copy of the pets. Call `.listen()` on it. */
export function createMockServer() {
  const pets = names.map((name, index) => ({
    id: index + 1,
    name,
    tag: tags[index % tags.length],
  }));
  let nextId = pets.length + 1;

  // `tags` arrives as `tags=dog&tags=cat` (the spec's form style) or `tags=dog,cat`.
  const findPets = (url) => {
    const wanted = url.searchParams
      .getAll("tags")
      .flatMap((value) => value.split(","))
      .filter(Boolean);
    return wanted.length === 0
      ? pets
      : pets.filter((pet) => wanted.includes(pet.tag));
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status, body) => {
      const headers = { ...corsHeaders };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      res.writeHead(status, headers);
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const sendError = (status, message) =>
      send(status, { code: status, message });

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...corsHeaders,
        "Access-Control-Allow-Headers":
          req.headers["access-control-request-headers"] ?? "*",
      });
      res.end();
      return;
    }

    const route = `${req.method} ${url.pathname}`;
    const limit = integerParam(url, "limit");
    const page = integerParam(url, "page") ?? 1;
    if (Number.isNaN(limit) || Number.isNaN(page) || page < 1) {
      sendError(400, "limit and page must be positive integers");
      return;
    }

    if (route === "GET /pets") {
      send(200, findPets(url).slice(0, limit));
      return;
    }

    if (route === "POST /pets") {
      const body = await readJson(req);
      if (typeof body?.name !== "string" || body.name === "") {
        sendError(400, "name is required");
        return;
      }
      const pet = { id: nextId++, name: body.name };
      if (typeof body.tag === "string") pet.tag = body.tag;
      // Newest first, so a pet added from an example shows up within its `limit`.
      pets.unshift(pet);
      send(200, pet);
      return;
    }

    if (route === "GET /paginated-pets") {
      const size = limit ?? 10;
      const found = findPets(url);
      const start = (page - 1) * size;
      const result = { pets: found.slice(start, start + size) };
      if (start + size < found.length) result.nextPage = page + 1;
      send(200, result);
      return;
    }

    // The spec declares these two paths without a response body.
    if (route === "GET /not-defined" || route === "POST /not-defined") {
      send(204);
      return;
    }

    const id = /^\/pets\/(\d+)$/.exec(url.pathname)?.[1];
    if (id !== undefined && (req.method === "GET" || req.method === "DELETE")) {
      const index = pets.findIndex((pet) => pet.id === Number(id));
      if (index === -1) {
        sendError(404, `Pet ${id} not found`);
      } else if (req.method === "GET") {
        send(200, pets[index]);
      } else {
        pets.splice(index, 1);
        send(204);
      }
      return;
    }

    sendError(404, `No mock for ${route}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // The examples' clients point at this port. It is not read from PORT: the
  // app's dev server runs in the same `npm run dev` and reads that variable.
  const port = 4010;
  const server = createMockServer();
  server.on("request", (req, res) => {
    res.on("finish", () => {
      console.log(`${req.method} ${req.url} ${res.statusCode}`);
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Mock Petstore API on http://localhost:${port}`);
  });
}
