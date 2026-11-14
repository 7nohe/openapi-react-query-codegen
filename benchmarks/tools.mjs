// The generators under comparison. Every tool is set up to produce TanStack
// Query v5 code for React on top of a fetch client, with its own defaults
// otherwise.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Packages every project has before the generator is added. */
export const BASE = ["react@19", "@tanstack/react-query@5", "@types/react@19"];

const config = (dir, name, source) => writeFileSync(join(dir, name), source);
const useHook = (op) => `use${op.id}`;

/**
 * Orval in one of its output modes.
 * @param {string} id
 * @param {string} label
 * @param {(out: string) => object} output what the mode adds to `output`
 */
const orval = (id, label, output) => ({
  id,
  label,
  project: "orval",
  typescript: "7",
  install: ["orval"],
  generate: ({ dir, spec, out }) => {
    config(
      dir,
      "orval.config.mjs",
      `export default ${JSON.stringify({
        api: {
          input: spec,
          output: {
            target: `${out}/api.ts`,
            client: "react-query",
            httpClient: "fetch",
            ...output(out),
          },
        },
      })};\n`,
    );
    return { bin: "orval", args: [] };
  },
  hookName: useHook,
});

/**
 * @typedef {object} Operation
 * @property {string} id operationId as written in the specification
 * @property {string} method lower-case HTTP method
 * @property {string} path
 *
 * @typedef {object} Tool
 * @property {string} id
 * @property {string} label
 * @property {string} project directory name; variants of one tool share it
 * @property {string} typescript newest TypeScript major the generator runs with
 * @property {string[]} install packages added on top of BASE
 * @property {string} [note]
 * @property {(ctx: { dir: string, spec: string, out: string }) => { bin: string, args: string[] }} generate
 * @property {(ctx: { dir: string, spec: string, out: string }) => void} [afterGenerate]
 * @property {(op: Operation) => string} [hookName] name of the export an application uses for the operation
 */

/**
 * @param {{ orqc: string }} options `orqc` is the package spec to install for this library
 * @returns {Tool[]}
 */
export function tools({ orqc }) {
  return [
    {
      id: "orqc",
      label: "openapi-react-query-codegen",
      project: "orqc",
      typescript: "7",
      install: [orqc],
      generate: ({ spec, out }) => ({
        bin: "openapi-rq",
        args: ["-i", spec, "-o", out],
      }),
      hookName: useHook,
    },
    {
      id: "hey-api",
      label: "@hey-api/openapi-ts + @tanstack/react-query plugin",
      project: "hey-api",
      // 0.99.0 uses the TypeScript compiler API, which TypeScript 7 does not have.
      typescript: "6",
      install: ["@hey-api/openapi-ts"],
      note: "Generates queryOptions/mutationOptions factories, not hooks.",
      generate: ({ dir, spec, out }) => {
        config(
          dir,
          "openapi-ts.config.mjs",
          `export default ${JSON.stringify({
            input: spec,
            output: out,
            plugins: ["@hey-api/client-fetch", "@tanstack/react-query"],
          })};\n`,
        );
        return { bin: "openapi-ts", args: [] };
      },
      hookName: (op) =>
        op.method === "get" ? `${op.id}Options` : `${op.id}Mutation`,
    },
    orval("orval", "Orval (mode: single, the default)", () => ({
      mode: "single",
    })),
    orval("orval-split", "Orval (mode: tags-split)", (out) => ({
      schemas: `${out}/model`,
      mode: "tags-split",
    })),
    {
      id: "kubb",
      label: "Kubb (plugin-ts, plugin-fetch, plugin-react-query)",
      project: "kubb",
      typescript: "7",
      install: [
        "kubb",
        "@kubb/plugin-ts",
        "@kubb/plugin-fetch",
        "@kubb/plugin-react-query",
      ],
      generate: ({ dir, spec, out }) => {
        config(
          dir,
          "kubb.config.mjs",
          [
            `import { defineConfig } from "kubb/config";`,
            `import { pluginTs } from "@kubb/plugin-ts";`,
            `import { pluginFetch } from "@kubb/plugin-fetch";`,
            `import { pluginReactQuery } from "@kubb/plugin-react-query";`,
            `export default defineConfig({`,
            `  input: ${JSON.stringify(spec)},`,
            `  output: { path: ${JSON.stringify(`./${out}`)} },`,
            `  plugins: [pluginTs(), pluginFetch(), pluginReactQuery({ hooks: true })],`,
            `});`,
            "",
          ].join("\n"),
        );
        return { bin: "kubb", args: ["generate"] };
      },
      hookName: useHook,
    },
    {
      id: "openapi-ts",
      label: "openapi-typescript + openapi-fetch + openapi-react-query",
      project: "openapi-ts",
      // openapi-typescript 7.13.0 declares the peer `typescript@^5.x`.
      typescript: "5",
      install: ["openapi-typescript", "openapi-fetch", "openapi-react-query"],
      note: "Generates types only; hooks are typed at the call site (`$api.useQuery('get', '/pets')`).",
      generate: ({ spec, out }) => ({
        bin: "openapi-typescript",
        args: [spec, "-o", `${out}/schema.d.ts`],
      }),
      afterGenerate: ({ dir, out }) => {
        mkdirSync(join(dir, out), { recursive: true });
        writeFileSync(
          join(dir, out, "client.ts"),
          [
            `import createFetchClient from "openapi-fetch";`,
            `import createClient from "openapi-react-query";`,
            `import type { paths } from "./schema";`,
            ``,
            `export const $api = createClient(createFetchClient<paths>({ baseUrl: "/" }));`,
            "",
          ].join("\n"),
        );
      },
    },
  ];
}
