import { type CollectionEntry, getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";
// The plugin does not export its page-to-Markdown conversion, and it is the
// same one that builds /llms-full.txt. The plugin version is pinned, so a
// release that moves this file fails the build instead of changing the output.
import { entryToSimpleMarkdown } from "../../node_modules/starlight-llms-txt/entryToSimpleMarkdown";

export const prerender = true;

/** Every page as Markdown at its own address plus `.md`, for agents. */
export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await getCollection("docs", (doc) => !doc.data.draft);
  return docs.map((doc) => ({ params: { slug: doc.id }, props: { doc } }));
};

export const GET: APIRoute<{ doc: CollectionEntry<"docs"> }> = async (
  context,
) => {
  const { doc } = context.props;
  const segments = [`# ${doc.data.hero?.title || doc.data.title}`];
  const description = doc.data.hero?.tagline || doc.data.description;
  if (description) segments.push(`> ${description}`);
  segments.push(await entryToSimpleMarkdown(doc, context, false));
  return new Response(`${segments.join("\n\n")}\n`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
