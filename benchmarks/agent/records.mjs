// One record per operation: what an agent needs to call it. This is a
// prototype of what `--describe` or an index file would hold; it is built from
// the generated client, not by the package.
import { pathToFileURL } from "node:url";

const strip = (text) =>
  (text ?? "")
    .replace(/\/\*\*[\s\S]*?\*\/\n?/g, "")
    .replace(/\n\s*/g, " ")
    .trim();

/**
 * @param {string} dist the `dist` directory of the installed package
 * @param {string} spec path of the OpenAPI document
 */
export async function buildRecords(dist, spec) {
  const { generateClient } = await import(
    pathToFileURL(`${dist}/client/index.mjs`).href
  );
  const generated = await generateClient({
    input: spec,
    client: "fetch",
    importExtension: "",
    pageParam: "page",
    schemas: false,
  });
  const types = generated.files.find((f) => f.name === "types.gen.ts").content;
  const blocks = new Map();
  for (const m of types.matchAll(
    /^export type (\w+)[^=]*= ([\s\S]*?);\n(?=\n|$)/gm,
  )) {
    blocks.set(m[1], m[2]);
  }
  const models = new Set(generated.modelNames);
  return generated.operations.map((op) => {
    const Name = op.capitalizedMethodName;
    const stem = op.dataTypeName.replace(/Data\d*$/, "");
    const data = strip(blocks.get(op.dataTypeName));
    const request = data
      .replace(/\burl: "[^"]*";?/, "")
      .replace(/\b(body|path|query)\?: never;?/g, "")
      .replace(/\s+/g, " ")
      .replace(/\{ \}/, "{}");
    const response = strip(blocks.get(`${stem}Responses`));
    const errors = strip(blocks.get(`${stem}Errors`));
    const isQuery = op.httpMethod === "GET";
    const hooks = isQuery
      ? {
          query: `use${Name}`,
          suspense: `use${Name}Suspense`,
          ...(op.isPaginatable ? { infinite: `use${Name}Infinite` } : {}),
          options: `${op.methodName}Options`,
          prefetch: `prefetchUse${Name}`,
          ensure: `ensureUse${Name}Data`,
          key: `use${Name}Key`,
          keyFn: `Use${Name}KeyFn`,
        }
      : {
          mutation: `use${Name}`,
          key: `use${Name}Key`,
          keyFn: `Use${Name}KeyFn`,
        };
    const named = `${request} ${response} ${errors}`.match(/[A-Z]\w*/g) ?? [];
    return {
      id: op.methodName,
      method: op.httpMethod,
      path: data.match(/\burl: "([^"]*)"/)?.[1] ?? "",
      summary:
        (op.jsDoc ?? "")
          .split("\n")
          .map((line) => line.replace(/^\s*\/?\*+\/?\s?/, "").trim())
          .find((line) => line && !line.startsWith("@")) ?? "",
      ...(op.jsDoc?.includes("@deprecated") ? { deprecated: true } : {}),
      hooks,
      request,
      response,
      ...(errors ? { errors } : {}),
      schemas: [...new Set(named.filter((name) => models.has(name)))],
    };
  });
}

/** The text `--describe` prints for one record. */
export function describe(record) {
  const { hooks } = record;
  const call = hooks.query
    ? `${hooks.query}(clientOptions${record.request.includes("path:") ? "" : "?"}, queryKey?, options?) from "queries" (useQuery)`
    : `${hooks.mutation}(mutationKey?, options?) from "queries" (useMutation); mutate(clientOptions)`;
  const others = Object.entries(hooks)
    .filter(([kind]) => kind !== "query" && kind !== "mutation")
    .map(([, name]) => name)
    .join(", ");
  return [
    `${record.id}  ${record.method} ${record.path}${record.deprecated ? "  (deprecated)" : ""}`,
    record.summary,
    `hook: ${call}`,
    `also: ${others}`,
    `clientOptions: ${record.request}`,
    `response by status: ${record.response}`,
    record.errors ? `errors by status: ${record.errors}` : undefined,
    record.schemas.length > 0
      ? `schemas named above (requests/types.gen.ts, \`export type <Name> = \`): ${record.schemas.join(", ")}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Records whose id, path, method or summary holds every word. */
export function search(records, words) {
  const wanted = words.map((word) => word.toLowerCase());
  return records.filter((record) => {
    const text =
      `${record.id} ${record.method} ${record.path} ${record.summary}`.toLowerCase();
    return wanted.every((word) => text.includes(word));
  });
}

export const listLine = (record) =>
  `${record.id}  ${record.method} ${record.path}  ${record.summary.slice(0, 90)}`;
