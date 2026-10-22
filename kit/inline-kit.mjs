// The kit as source, to inline into a standalone page: every `export` dropped, so the
// figures' live scripts can use its functions directly. Vendored from the anatomy kit, which
// keeps this in scripts/inline-kit.mjs; here it sits beside the files it reads.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = dirname(fileURLToPath(import.meta.url));
const strip = (file) => readFileSync(join(KIT, file), "utf8").replace(/^export /gm, "");

export function kitScript() {
  return strip("iso-kit.mjs");
}
