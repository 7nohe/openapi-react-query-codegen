import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

const site = "https://openapi-react-query-codegen.vercel.app";
const ogUrl = new URL("og.jpg", site).href;
const ogImageAlt = "OpenAPI React Query Codegen";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "OpenAPI React Query Codegen",
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
            { slug: "guides/migrating-to-v3" },
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
