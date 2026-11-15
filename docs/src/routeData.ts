import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

const siteName = "OpenAPI React Query Codegen";

/**
 * Adds to every page a link to its Markdown version and, except on the home
 * page (which describes the software in its frontmatter), structured data
 * that says which site the page belongs to.
 */
export const onRequest = defineRouteMiddleware((context) => {
  const { entry, head } = context.locals.starlightRoute;
  const site = context.site;
  // The 404 page has no Markdown version and nothing to describe.
  if (!site || entry.id === "404") return;

  // Starlight gives the home page an empty id.
  const id = entry.id || "index";
  const isHome = id === "index";
  const page = new URL(isHome ? "/" : `/${id}/`, site).href;
  head.push({
    tag: "link",
    attrs: {
      rel: "alternate",
      type: "text/markdown",
      href: new URL(`/${id}.md`, site).href,
    },
  });
  if (isHome) return;

  const home = new URL("/", site).href;
  head.push({
    tag: "script",
    attrs: { type: "application/ld+json" },
    content: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          "@id": `${page}#article`,
          headline: entry.data.title,
          description: entry.data.description,
          url: page,
          inLanguage: "en",
          isPartOf: { "@id": `${home}#website` },
          about: { "@id": `${home}#software` },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: siteName, item: home },
            { "@type": "ListItem", position: 2, name: entry.data.title },
          ],
        },
      ],
    }),
  });
});
