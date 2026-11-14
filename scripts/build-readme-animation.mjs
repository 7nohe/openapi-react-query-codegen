// Writes the animation at the top of the README, in a light and a dark
// variant: an operation of the specification, the command, and the hooks it
// becomes. GitHub shows README images without scripts, so the animation is
// CSS inside the SVG. Every element runs the same 10 s cycle with its own
// keyframes, so the loop stays in step without animation delays.
//
//   node scripts/build-readme-animation.mjs
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".github/assets");

// The documentation site's colours (docs/src/styles/theme.css).
const themes = {
  light: {
    bg: "#f4f8fc",
    line: "#c4d0e0",
    text: "#17365c",
    muted: "#51698a",
    accent: "#1c69b5",
    signal: "#2f7d16",
    soft: "rgb(63 138 34 / 0.12)",
  },
  dark: {
    bg: "#112741",
    line: "#29415f",
    text: "#e6eef8",
    muted: "#8ea3be",
    accent: "#4f9fe8",
    signal: "#93d66e",
    soft: "rgb(147 214 110 / 0.14)",
  },
};

const width = 880;
const height = 372;
const cycle = 10;
const mono =
  "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const sans =
  "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const command = "npx @7nohe/orqc@beta -i openapi.yaml";
const commandSize = 16;
const charWidth = 0.61 * commandSize;

/** Hidden until `at` seconds, shown until 90 % of the cycle. */
function appear(name, at) {
  const start = ((at / cycle) * 100).toFixed(2);
  const end = (((at + 0.35) / cycle) * 100).toFixed(2);
  return `@keyframes ${name} {
  0%, ${start}% { opacity: 0; transform: translateX(-6px); }
  ${end}%, 90% { opacity: 1; transform: none; }
  94%, 100% { opacity: 0; transform: none; }
}
.${name} { animation: ${name} ${cycle}s linear infinite; }`;
}

const rows = [
  ["use", "FindPets", "", "useQuery"],
  ["", "findPets", "Options", "queryOptions"],
  ["use", "FindPets", "Suspense", "useSuspenseQuery"],
  ["prefetchUse", "FindPets", "", "prefetchQuery"],
  ["Use", "FindPets", "KeyFn", "query key"],
];

const escapeXml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svg(colors) {
  const css = [
    `text { font-family: ${mono}; fill: ${colors.text}; }`,
    `.label { font-family: ${sans}; font-size: 12px; fill: ${colors.muted}; letter-spacing: 0.02em; }`,
    `.muted { fill: ${colors.muted}; }`,
    `.signal { fill: ${colors.signal}; font-weight: 600; }`,
    `.code { font-size: 14px; }`,
    // Typing: a clip that widens one character at a time.
    `@keyframes type {
  0%, 2% { width: 0; animation-timing-function: steps(${command.length}, end); }
  13%, 100% { width: ${Math.ceil(command.length * charWidth) + 24}px; }
}
.typing { animation: type ${cycle}s linear infinite; }`,
    `@keyframes draw {
  0%, 14% { stroke-dashoffset: 64; }
  19%, 90% { stroke-dashoffset: 0; }
  94%, 100% { stroke-dashoffset: 64; }
}
.arrow { stroke-dasharray: 64; animation: draw ${cycle}s ease-out infinite; }`,
    appear("mark", 1.3),
    ...rows.map((_, i) => appear(`row${i}`, 2 + i * 0.25)),
    appear("requests", 3.4),
    appear("usage", 4),
    `@media (prefers-reduced-motion: reduce) {
  .typing, .arrow, .mark, ${rows.map((_, i) => `.row${i}`).join(", ")}, .requests, .usage { animation: none; }
}`,
  ].join("\n");

  const spec = [
    [["paths:"]],
    [["  /pets:"]],
    [["    get:"]],
    [["      operationId: "], ["findPets", "signal"]],
    [["      responses: "], ['{ "200": Pet[] }', "muted"]],
  ];
  const specLines = spec
    .map(
      (parts, i) =>
        `<text class="code" x="32" y="${132 + i * 26}" xml:space="preserve">${parts
          .map(([t, c]) =>
            c ? `<tspan class="${c}">${escapeXml(t)}</tspan>` : escapeXml(t),
          )
          .join("")}</text>`,
    )
    .join("\n    ");

  const rowLines = rows
    .map(([before, id, after, note], i) => {
      const y = 132 + i * 26;
      return `<g class="row${i}">
      <text class="code" x="452" y="${y}">${escapeXml(before)}<tspan class="signal">${id}</tspan>${escapeXml(after)}</text>
      <text class="code muted" x="${width - 32}" y="${y}" text-anchor="end">${note}</text>
    </g>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">How OpenAPI React Query Codegen works</title>
  <desc id="desc">The findPets operation of an OpenAPI document. Running npx @7nohe/orqc@beta -i openapi.yaml generates useFindPets, findPetsOptions, useFindPetsSuspense, prefetchUseFindPets and UseFindPetsKeyFn in openapi/queries, plus a typed client in openapi/requests. An app then calls useFindPets.</desc>
  <style>
${css}
  </style>
  <defs>
    <clipPath id="typed"><rect class="typing" x="52" y="18" height="32" width="${Math.ceil(command.length * charWidth) + 24}" /></clipPath>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${colors.bg}" stroke="${colors.line}" />

  <text x="32" y="40" font-size="${commandSize}" class="muted">$</text>
  <text x="52" y="40" font-size="${commandSize}" clip-path="url(#typed)">${command}</text>
  <line x1="0" y1="62" x2="${width}" y2="62" stroke="${colors.line}" />

  <text class="label" x="32" y="94">openapi.yaml</text>
  <rect class="mark" x="24" y="${132 + 3 * 26 - 18}" width="352" height="26" rx="4" fill="${colors.soft}" />
  ${specLines}

  <path class="arrow" d="M 384 ${132 + 3 * 26 - 5} h 52 m -10 -8 l 10 8 l -10 8" fill="none" stroke="${colors.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />

  <text class="label" x="452" y="94">openapi/queries</text>
  ${rowLines}
  <text class="code muted requests" x="452" y="${132 + 5 * 26 + 8}">+ openapi/requests: typed fetch or axios client</text>

  <line x1="0" y1="290" x2="${width}" y2="290" stroke="${colors.line}" />
  <text class="label" x="32" y="320">your app</text>
  <text class="usage" x="32" y="350" font-size="15">const { data } = <tspan class="signal">useFindPets</tspan>({ query: { limit: 10 } });</text>
</svg>
`;
}

for (const [name, colors] of Object.entries(themes)) {
  const file = path.join(out, `how-it-works-${name}.svg`);
  await writeFile(file, svg(colors));
  console.log(`wrote ${path.relative(root, file)}`);
}
