// Remove the paths given as arguments, like `rm -rf`, on every platform.
import { rmSync } from "node:fs";

for (const path of process.argv.slice(2)) {
  rmSync(path, { recursive: true, force: true });
}
