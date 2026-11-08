// The generated client ships a small runtime as plain TypeScript source. tsc
// only emits JavaScript, so copy the sources next to the compiled generator.
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/client/runtime", { recursive: true });
cpSync("src/client/runtime", "dist/client/runtime", { recursive: true });
