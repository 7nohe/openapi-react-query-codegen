import starlight from "@astrojs/starlight";
// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "OpenAPI React Query Codegen",
      social: {
        github: "https://github.com/7nohe/openapi-react-query-codegen",
      },
      sidebar: [
        {
          label: "Guides",
          items: [
            { slug: "guides/introduction" },
            { slug: "guides/usage" },
            { slug: "guides/cli-options" },
          ],
        },
        {
          label: "Examples",
          autogenerate: { directory: "examples" },
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
