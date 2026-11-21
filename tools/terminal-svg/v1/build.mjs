// File: build.mjs
// What it does: Regenerates the animated terminal SVGs used by README.md.
//   Run from the repo root:  node tools/terminal-svg/v1/build.mjs
//   Writes one file per entry in ./content.mjs into assets/terminal/.
// Requirements/dependencies: Node 18+ (ESM, node:fs, node:path, node:url),
//   ./svg.mjs, ./content.mjs.
// Where it's used: run by hand after editing ./content.mjs; output is
//   referenced from README.md.
// Callable exports: none (CLI script).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderTerminal } from "./svg.mjs";
import { terminals } from "./content.mjs";

// Resolve the output folder relative to this file, not the caller's cwd.
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "assets", "terminal");
mkdirSync(outDir, { recursive: true });

// Warn loudly about lines that would overflow the 900px window (100 chars).
for (const { file, spec } of terminals) {
  spec.lines.forEach((line, i) => {
    const len = (line.segs ?? []).reduce((a, [t]) => a + t.length, 0);
    if (len > 100) throw new Error(`${file}: line ${i + 1} is ${len} chars (max 100)`);
  });
  const out = join(outDir, file);
  writeFileSync(out, renderTerminal(spec), "utf8");
  console.log(`wrote ${out}`);
}
