// The generated client ships a small runtime as plain TypeScript source. tsc
// type-checks the runtime files and also emits JavaScript for them, which
// nothing uses, so replace the emitted files with the sources themselves.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const target = "dist/client/runtime";
mkdirSync(target, { recursive: true });
for (const file of readdirSync(target)) {
  if (file.endsWith(".js") || file.endsWith(".d.ts")) {
    rmSync(path.join(target, file));
  }
}
cpSync("src/client/runtime", target, { recursive: true });
