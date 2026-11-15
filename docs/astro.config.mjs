import { satteri } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";

const site = "https://orqc.7nohe.dev";
const ogUrl = new URL("og.jpg", site).href;
const ogImageAlt = "OpenAPI React Query Codegen";
const repo = "https://github.com/7nohe/openapi-react-query-codegen";

// What a model reads first in /llms.txt, before it decides which of the
// documentation sets below to fetch.
const llmsDescription =
  "`@7nohe/openapi-react-query-codegen` is a CLI (`orqc`; `openapi-rq` also works) that generates TanStack Query v5 (React Query) hooks from an OpenAPI 3.0/3.1 specification. It generates a TypeScript HTTP client (fetch or axios) in `<output>/requests/`, then generates typed `useQuery`, `useSuspenseQuery`, `useInfiniteQuery` and `useMutation` hooks, `queryOptions` factories, `prefetchQuery` / `ensureQueryData` helpers and query key functions in `<output>/queries/`.";

const llmsDetails = `Key facts for agents:

- Install: \`npm install -D @7nohe/openapi-react-query-codegen@beta\` (v4 is in beta; without \`@beta\` npm installs v3) and \`npm install @tanstack/react-query\`. Only the scoped package belongs to this project.
- Run: \`orqc -i ./openapi.yaml -o ./src/openapi\`. Keep the flags in a package.json script and always pass the same ones.
- Do not edit generated files. Change the spec or the flags and regenerate.
- \`--check\` changes no existing file and exits 1 when the committed output is out of date, which makes it a CI drift check.
- \`--json\` prints failures as one line of JSON on stderr: \`{"code","message","details"}\`. Exit codes: 0 ok, 1 out of date, 2 error.
- The npm package ships an \`AGENTS.md\` with the full flag table, the generated layout, naming conventions and error codes.
- Every page of the documentation is also served as Markdown: drop the trailing slash of its address and add \`.md\`, as in https://orqc.7nohe.dev/guides/usage.md.`;

// https://astro.build/config
export default defineConfig({
  site,
  // The example page was renamed when the example moved to React Router 8.
  redirects: {
    "/examples/react-router-7/": "/examples/react-router/",
  },
  // The guides are full of command line flags: `--check` must stay two
  // hyphens, not become a dash.
  markdown: {
    processor: satteri({ features: { smartPunctuation: false } }),
  },
  integrations: [
    starlight({
      title: "OpenAPI React Query Codegen",
      routeMiddleware: "./src/routeData.ts",
      customCss: [
        "@fontsource-variable/ibm-plex-sans/wght.css",
        "@fontsource/ibm-plex-mono/400.css",
        "@fontsource/ibm-plex-mono/500.css",
        "./src/styles/theme.css",
      ],
      components: {
        Banner: "./src/components/Banner.astro",
        Hero: "./src/components/Hero.astro",
      },
      social: [{ icon: "github", label: "GitHub", href: repo }],
      plugins: [
        // Builds /llms.txt, /llms-full.txt and /llms-small.txt from the pages,
        // so they cannot fall behind the documentation.
        starlightLlmsTxt({
          description: llmsDescription,
          details: llmsDetails,
          customSets: [
            {
              label: "Getting started and usage",
              description:
                "install, first run, the generated layout, using the generated hooks and queryOptions factories, every CLI option, mock data and MSW handlers, CI checks and coding agents",
              paths: [
                "guides/introduction",
                "guides/usage",
                "guides/cli-options",
                "guides/mocking",
                "guides/ci-and-agents",
              ],
            },
            {
              label: "Examples",
              description:
                "Vite + React, Next.js, TanStack Router and React Router",
              paths: ["examples/**"],
            },
            {
              label: "Migration guides",
              description:
                "from v2 to v3, from v3 to v4, and from openapi-typescript + openapi-react-query",
              paths: ["guides/migrating-*"],
            },
            {
              label: "Benchmarks",
              description:
                "generation time, install size and type errors compared with other generators, and what a coding agent spends",
              paths: ["guides/benchmarks"],
            },
          ],
          promote: [
            "index*",
            "guides/introduction",
            "guides/usage",
            "guides/cli-options",
            "guides/mocking",
            "guides/ci-and-agents",
          ],
          demote: ["guides/migrating-to-v3", "contributing", "license"],
          exclude: ["guides/migrating-to-v3", "contributing", "license"],
          // The link Starlight puts next to every heading.
          customSelectors: { all: [".sl-anchor-link"] },
          optionalLinks: [
            {
              label: "AGENTS.md",
              url: `${repo}/blob/main/AGENTS.md`,
              description:
                "agent guide, also at `node_modules/@7nohe/openapi-react-query-codegen/AGENTS.md`",
            },
            { label: "Source code", url: repo },
            {
              label: "npm package",
              url: "https://www.npmjs.com/package/@7nohe/openapi-react-query-codegen",
            },
          ],
        }),
      ],
      head: [
        {
          tag: "meta",
          attrs: { property: "og:image", content: ogUrl },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:alt", content: ogImageAlt },
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1415" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "743" } },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { slug: "guides/introduction" },
            { slug: "guides/usage" },
            { slug: "guides/cli-options" },
            { slug: "guides/mocking" },
            { slug: "guides/ci-and-agents" },
            { slug: "guides/benchmarks" },
            { slug: "guides/migrating-to-v3" },
            { slug: "guides/migrating-to-v4" },
            { slug: "guides/migrating-from-openapi-react-query" },
          ],
        },
        {
          label: "Examples",
          items: [{ autogenerate: { directory: "examples" } }],
        },
        {
          slug: "contributing",
        },
        {
          slug: "license",
        },
      ],
    }),
  ],
});
