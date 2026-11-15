import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const docsDir = fileURLToPath(new URL("./content/docs/", import.meta.url));

function git(...args) {
  try {
    return execFileSync("git", args, {
      cwd: docsDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// A shallow clone has no commit older than its depth, so most pages would get
// the date of the oldest commit that was fetched. No date is better than a
// wrong one: the build host has to fetch the full history for these to appear
// (on Vercel, the VERCEL_DEEP_CLONE environment variable).
const hasHistory = git("rev-parse", "--is-shallow-repository") === "false";

/**
 * When the page at `pathname` was last committed, for the sitemap.
 * @param {string} pathname
 * @returns {string | undefined}
 */
export function lastModified(pathname) {
  if (!hasHistory) return undefined;
  const slug = pathname.replace(/^\/|\/$/g, "") || "index";
  const file = ["mdx", "md"]
    .map((extension) => `${slug}.${extension}`)
    .find((name) => existsSync(docsDir + name));
  const date = file && git("log", "-1", "--format=%cI", "--", file);
  return date ? new Date(date).toISOString() : undefined;
}
