import { satteri } from "@astrojs/markdown-satteri";
import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

const site = "https://openapi-react-query-codegen.vercel.app";
const ogUrl = new URL("og.jpg", site).href;
const ogImageAlt = "OpenAPI React Query Codegen";

// https://astro.build/config
export default defineConfig({
  site,
  // The guides are full of command line flags: `--check` must stay two
  // hyphens, not become a dash.
  markdown: {
    processor: satteri({ features: { smartPunctuation: false } }),
  },
  integrations: [
    starlight({
      title: "OpenAPI React Query Codegen",
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
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/7nohe/openapi-react-query-codegen",
        },
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
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { slug: "guides/introduction" },
            { slug: "guides/usage" },
            { slug: "guides/cli-options" },
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
