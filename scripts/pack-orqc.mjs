// Packs @7nohe/orqc at the main package's version, depending on exactly that
// version, so `npx @7nohe/orqc@X` always runs `@7nohe/openapi-react-query-codegen@X`.
// The template in packages/orqc has no version of its own and is private, so
// it can only be published through this script.
//
//   node scripts/pack-orqc.mjs <destination directory>
import { execFileSync, execSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.resolve(process.argv[2] ?? "artifact");

const main = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const template = JSON.parse(
  await readFile(path.join(root, "packages/orqc/package.json"), "utf8"),
);

const { private: _private, ...rest } = template;
const manifest = {
  ...rest,
  version: main.version,
  dependencies: { [main.name]: main.version },
  engines: { node: main.engines.node },
};

const work = await mkdtemp(path.join(tmpdir(), "orqc-pack-"));
try {
  await cp(path.join(root, "packages/orqc"), work, { recursive: true });
  await writeFile(
    path.join(work, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await mkdir(destination, { recursive: true });
  const options = { cwd: work, stdio: ["ignore", "ignore", "inherit"] };
  if (process.platform === "win32") {
    // npm is npm.cmd on Windows, which Node only starts through a shell.
    // Windows paths cannot contain double quotes.
    execSync(
      `npm pack --ignore-scripts --pack-destination "${destination}"`,
      options,
    );
  } else {
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", destination],
      options,
    );
  }
  console.log(
    `packed ${manifest.name}@${manifest.version} into ${destination}`,
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
