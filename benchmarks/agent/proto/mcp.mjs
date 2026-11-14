#!/usr/bin/env node
// Prototype MCP server (stdio, JSON-RPC 2.0, one message per line) with the
// same two lookups as the CLI prototype.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { describe, listLine, search } from "./records.mjs";

const records = readFileSync(
  new URL("./operations.jsonl", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const tools = [
  {
    name: "search_operations",
    description:
      "Find operations of the generated API client in src/openapi by words in their name, URL path or summary. Returns one line per operation: name, method, path, summary.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words that must all match" },
      },
      required: ["query"],
    },
  },
  {
    name: "describe_operation",
    description:
      "For one operation of the generated API client in src/openapi: the TanStack Query hooks to call, the type of clientOptions (path, query, body), the response by status and the schemas they name.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Operation name as search_operations returns it",
        },
      },
      required: ["name"],
    },
  },
];

const text = (value, isError = false) => ({
  content: [{ type: "text", text: value }],
  isError,
});

function call(name, input) {
  if (name === "search_operations") {
    const found = search(
      records,
      String(input.query ?? "")
        .split(/\s+/)
        .filter(Boolean),
    );
    const shown = found.slice(0, 30).map(listLine);
    if (found.length > 30)
      shown.push(`… ${found.length - 30} more; add a word to narrow the list.`);
    return text(shown.join("\n") || "No operation matches.");
  }
  if (name === "describe_operation") {
    const record = records.find((r) => r.id === input.name);
    return record
      ? text(describe(record))
      : text(
          `No operation named ${input.name}. Use search_operations first.`,
          true,
        );
  }
  return text(`Unknown tool ${name}`, true);
}

const reply = (id, result) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === undefined) return;
  switch (message.method) {
    case "initialize":
      return reply(message.id, {
        protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "openapi-rq", version: "0.0.0" },
        instructions:
          "Looks up the generated API client in src/openapi. Use search_operations, then describe_operation, instead of reading the large generated files.",
      });
    case "tools/list":
      return reply(message.id, { tools });
    case "tools/call":
      return reply(
        message.id,
        call(message.params?.name, message.params?.arguments ?? {}),
      );
    case "ping":
      return reply(message.id, {});
    default:
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } })}\n`,
      );
  }
});
