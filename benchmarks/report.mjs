// Turns results.json into Markdown tables.

const seconds = (ms) =>
  ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : `${(ms / 1000).toFixed(2)} s`;
const thousands = (n) => Math.round(n).toLocaleString("en-US");
const megabytes = (kb) => `${(kb / 1024).toFixed(1)} MB`;

/** `text` is how many leading columns hold text; the rest are numbers. */
function table(head, rows, text = 1) {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map((_, i) => (i < text ? "---" : "---:")).join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n");
}

/**
 * @param {any} results
 * @param {import("./tools.mjs").Tool[]} tools
 */
export function report(results, tools) {
  const specs = Object.keys(results.specs ?? {});
  const present = tools.filter((tool) =>
    specs.some((spec) => results.pairs[`${tool.id}/${spec}`]),
  );
  const cell = (tool, spec, render) => {
    const entry = results.pairs[`${tool.id}/${spec}`];
    if (!entry) return "–";
    if (entry.generate?.failed) return "failed";
    try {
      return render(entry) ?? "–";
    } catch {
      return "–";
    }
  };
  const perSpec = (render) =>
    present.map((tool) => [
      tool.id,
      ...specs.map((spec) => cell(tool, spec, render)),
    ]);

  const env = results.environment;
  const lines = [
    "# Benchmark results",
    "",
    `Measured on ${env.date} with Node.js ${env.node} on ${env.os} (${env.cpu}). Packages released after ${env.releasedBefore} were not installed. Token counts use ${env.tokenizer}; other tokenizers give different absolute numbers.`,
    "",
    "## Tools",
    "",
    table(
      ["id", "setup", "versions", "TypeScript", "packages added", "size added"],
      present.map((tool) => {
        const install = results.install[tool.project] ?? {};
        return [
          tool.id,
          tool.label,
          Object.entries(install.versions ?? {})
            .map(([name, version]) => `${name} ${version}`)
            .join(", "),
          install.typescript ?? "–",
          install.addedPackages ?? "–",
          install.addedKilobytes ? megabytes(install.addedKilobytes) : "–",
        ];
      }),
      4,
    ),
    '"Added" is what installing the generator adds to a project that already has React, TanStack Query and TypeScript. "TypeScript" is the newest major the generator runs with.',
    "",
    "## Specifications",
    "",
    table(
      ["name", "size", "operations", "sampled operations"],
      specs.map((name) => {
        const spec = results.specs[name];
        return [
          name,
          `${thousands(spec.bytes / 1024)} KB`,
          spec.operations,
          spec.sampled.join("<br>"),
        ];
      }),
    ),
    "## Generation time",
    "",
    "Median wall-clock time of the CLI.",
    "",
    table(
      ["tool", ...specs],
      perSpec((e) => seconds(e.generate.medianMs)),
    ),
    "## Generated output",
    "",
    "Files / lines.",
    "",
    table(
      ["tool", ...specs],
      perSpec(
        (e) => `${thousands(e.output.files)} / ${thousands(e.output.lines)}`,
      ),
    ),
    "## Type-checking the output",
    "",
    "Median wall-clock time of `tsc --noEmit` over the generated directory, TypeScript 7 / TypeScript 6. A number in parentheses is the count of type errors.",
    "",
    table(
      ["tool", ...specs],
      perSpec((e) => {
        const one = (c) =>
          c ? `${seconds(c.medianMs)}${c.errors ? ` (${c.errors})` : ""}` : "–";
        return `${one(e.typecheck?.ts7)} / ${one(e.typecheck?.ts6)}`;
      }),
    ),
    "## Tokens in the output",
    "",
    "All generated source files / the largest single file.",
    "",
    table(
      ["tool", ...specs],
      perSpec(
        (e) =>
          `${thousands(e.analysis.totalTokens)} / ${thousands(e.analysis.largestFileTokens)}`,
      ),
    ),
    "## Tokens to use one operation",
    "",
    'Average over the sampled operations. "Declarations" is the hook (or options factory) plus everything its declaration names, two levels deep, read as exact ranges. "Files" is the same set read as whole files, with the number of files in parentheses.',
    "",
    table(
      ["tool", ...specs.flatMap((s) => [`${s}: declarations`, `${s}: files`])],
      present.map((tool) => [
        tool.id,
        ...specs.flatMap((spec) => {
          const entry = results.pairs[`${tool.id}/${spec}`];
          const found = (entry?.analysis?.lookups ?? []).filter(
            (l) => l.closureTokens !== undefined,
          );
          if (found.length === 0) return ["–", "–"];
          const mean = (key) =>
            found.reduce((sum, l) => sum + l[key], 0) / found.length;
          const missing = entry.analysis.lookups.length - found.length;
          const suffix = missing
            ? ` [${found.length} of ${entry.analysis.lookups.length}]`
            : "";
          return [
            `${thousands(mean("closureTokens"))}${suffix}`,
            `${thousands(mean("fileTokens"))} (${mean("files").toFixed(1)})`,
          ];
        }),
      ]),
    ),
    "## Browser bundle",
    "",
    "The sampled operations' hooks and the runtime they pull in, bundled and minified with esbuild, React and TanStack Query external. Minified / gzip.",
    "",
    table(
      ["tool", ...specs],
      perSpec((e) =>
        e.analysis.bundle?.bytes
          ? `${thousands(e.analysis.bundle.bytes)} B / ${thousands(e.analysis.bundle.gzipBytes)} B`
          : e.analysis.bundle?.error
            ? "error"
            : "–",
      ),
    ),
  ];
  const notes = present.filter((tool) => tool.note);
  if (notes.length > 0) {
    lines.push(
      "## Notes",
      "",
      ...notes.map((tool) => `- **${tool.id}**: ${tool.note}`),
      "",
    );
  }
  return lines.join("\n");
}
