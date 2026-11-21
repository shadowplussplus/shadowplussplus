// File: svg.mjs
// What it does: Renders a terminal "script" (lines of coloured segments) into a
//   self-contained animated SVG. Lines type out character by character via SMIL
//   clip-rect animations, a block cursor follows the typing, and an optional
//   segmented progress bar loops forever once reached. SMIL is used (not CSS or
//   JS) because GitHub serves README images through <img>, where scripts are
//   stripped but SMIL animations still play in Chrome, Firefox and Safari.
// Requirements/dependencies: none (pure Node ESM, string output only).
// Where it's used: ./build.mjs.
// Callable exports: renderTerminal(spec) → string (SVG markup).

// ── Geometry ────────────────────────────────────────────────────────────────
// CHAR_W is the advance of one monospace glyph at FONT px. Each line's text is
// forced to exactly chars × CHAR_W with textLength, so the reveal clip lands on
// character boundaries whatever monospace font the viewer's system picks.
const WIDTH = 900;
const FONT = 14;
const CHAR_W = 8.4;
const LINE_H = 22;
const PAD_X = 24;
const BAR_H = 34; // title bar height
const FIRST_BASELINE = BAR_H + 30;
const PAD_BOTTOM = 22;

// ── Palette (matches the profile: crimson + cyan on near-black) ─────────────
export const COLORS = {
  bg: "#0b0f14",
  bar: "#11161d",
  border: "#262c36",
  fg: "#e6edf3",
  muted: "#7d8590",
  crimson: "#DC143C",
  cyan: "#00F7FF",
  ok: "#3fb950",
  amber: "#f0b429",
};

// ── Typing speeds (seconds) ─────────────────────────────────────────────────
// `cmd` lines are typed slowly like a human; `out` lines stream like program
// output (two chars per frame). `before` is the pause before a line starts.
const SPEED = {
  cmd: { char: 0.055, step: 1, before: 0.45, after: 0.15 },
  out: { char: 0.012, step: 2, before: 0, after: 0.1 },
};

// Progress bar look: CELLS squares of CELL px with GAP px between them.
const CELLS = 32;
const CELL = 11;
const GAP = 3;
const BAR_LOOP = 3.4; // seconds per fill cycle

/** Escape the five XML-significant characters for text content/attributes. */
function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Round to 3 decimals so the SVG stays small and diff-friendly. */
const r = (n) => Math.round(n * 1000) / 1000;

/** Width of the reveal clip for `count` visible characters. */
const clipW = (count) => r(count * CHAR_W + (count > 0 ? 2 : 0));

/**
 * Build the list of visible-character counts for one line's typing frames.
 * Starts at `instant` (chars shown immediately, e.g. the "$ " prompt) and
 * always ends exactly at `n`, so the full line is shown when typing stops.
 */
function typingSteps(n, instant, step) {
  const steps = [];
  for (let c = instant; c < n; c += step) steps.push(c);
  steps.push(n);
  return steps;
}

/** One <text> element made of coloured <tspan> segments. */
function textEl(segs, x, y) {
  const n = segs.reduce((a, [t]) => a + t.length, 0);
  const spans = segs
    .map(([t, c]) => `<tspan fill="${COLORS[c] ?? COLORS.fg}">${esc(t)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" textLength="${r(n * CHAR_W)}" lengthAdjust="spacing" xml:space="preserve">${spans}</text>`;
}

/**
 * Render a terminal spec to SVG.
 * spec = { title: string, lines: Line[] } where Line is one of:
 *   { kind: "cmd", segs: [[text, colorKey], ...] }   typed slowly; a leading
 *       segment coloured "crimson" is treated as the prompt and shown at once
 *   { kind: "out", segs: [...] }                     streamed fast
 *   { kind: "blank" }                                empty spacer line
 *   { kind: "progress", segs: [...] }                label, then a looping bar
 * The final line should be a bare prompt; the cursor rests (blinking) after it.
 */
export function renderTerminal({ title, lines }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("renderTerminal: spec.lines must be a non-empty array");
  }

  const height = FIRST_BASELINE + (lines.length - 1) * LINE_H + PAD_BOTTOM;
  const defs = [];
  const body = [];
  // Cursor keyframes: where the block cursor sits from time t onwards.
  const frames = [{ t: 0, x: PAD_X, y: FIRST_BASELINE }];
  let t = 0.5; // small delay so the empty window is seen first

  lines.forEach((line, i) => {
    const y = FIRST_BASELINE + i * LINE_H;
    if (line.kind === "blank") return;

    const sp = SPEED[line.kind === "cmd" ? "cmd" : "out"];
    if (!sp) throw new Error(`renderTerminal: unknown line kind "${line.kind}"`);
    const segs = line.segs ?? [];
    const n = segs.reduce((a, [s]) => a + s.length, 0);
    // A crimson first segment on a command line is its prompt → appears at once.
    const instant = line.kind === "cmd" && segs[0]?.[1] === "crimson" ? segs[0][0].length : 0;

    t += sp.before;
    const begin = t;
    const steps = typingSteps(n, instant, sp.step);
    const dur = steps.length * sp.char;

    // Reveal clip: discrete width jumps = one jump per typed frame.
    const id = `l${i}`;
    const values = steps.map(clipW).join(";");
    const keyTimes = steps.map((_, k) => r(k / steps.length)).join(";");
    defs.push(
      `<clipPath id="${id}"><rect x="${PAD_X - 1}" y="${y - FONT - 2}" height="${LINE_H}" width="0">` +
        `<animate attributeName="width" values="${values}" keyTimes="${keyTimes}" calcMode="discrete" begin="${r(begin)}s" dur="${r(dur)}s" fill="freeze"/>` +
        `</rect></clipPath>`,
    );
    body.push(`<g clip-path="url(#${id})">${textEl(segs, PAD_X, y)}</g>`);

    // Cursor follows each typed frame on this line.
    steps.forEach((count, k) => frames.push({ t: begin + k * sp.char, x: PAD_X + count * CHAR_W + 2, y }));
    t = begin + dur + sp.after;

    // Progress line: after its label, a segmented bar fades in and loops.
    if (line.kind === "progress") {
      const bx = PAD_X + n * CHAR_W + 8;
      const by = y - CELL + 1;
      const fullW = CELLS * (CELL + GAP) - GAP;
      const cells = (fill) =>
        Array.from({ length: CELLS }, (_, c) => `<rect x="${bx + c * (CELL + GAP)}" y="${by}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"/>`).join("");
      // Fill one whole cell per frame (discrete), spend 85% of the loop
      // filling, then hold the full bar briefly before it restarts.
      const barVals = Array.from({ length: CELLS + 1 }, (_, c) => (c === CELLS ? fullW + 2 : c * (CELL + GAP)));
      const barKeys = barVals.map((_, c) => r((c / CELLS) * 0.85));
      defs.push(
        `<clipPath id="${id}bar"><rect x="${bx - 1}" y="${by - 1}" height="${CELL + 2}" width="0">` +
          `<animate attributeName="width" values="${barVals.join(";")}" keyTimes="${barKeys.join(";")}" calcMode="discrete" begin="${r(t)}s" dur="${BAR_LOOP}s" repeatCount="indefinite"/>` +
          `</rect></clipPath>`,
      );
      body.push(
        `<g opacity="0"><set attributeName="opacity" to="1" begin="${r(t)}s" fill="freeze"/>${cells(COLORS.border)}` +
          `<g clip-path="url(#${id}bar)">${cells(COLORS.cyan)}</g></g>`,
      );
      // Park the cursor out of the way while the bar runs on.
      frames.push({ t, x: bx + fullW + 10, y });
      t += 0.5;
    }
  });

  const total = t + 0.3;
  // keyTimes must start at 0 and strictly increase → keep the last frame per time.
  const byTime = new Map();
  frames.forEach((f) => byTime.set(r(f.t / total), f));
  const kf = [...byTime.entries()].sort((a, b) => a[0] - b[0]);
  const kt = kf.map(([k]) => k).join(";");
  const xs = kf.map(([, f]) => r(f.x)).join(";");
  const ys = kf.map(([, f]) => r(f.y - FONT + 1)).join(";");

  const cursor =
    `<rect x="${PAD_X}" y="${FIRST_BASELINE - FONT + 1}" width="${CHAR_W}" height="${FONT + 2}" fill="${COLORS.cyan}">` +
    `<animate attributeName="x" values="${xs}" keyTimes="${kt}" calcMode="discrete" dur="${r(total)}s" fill="freeze"/>` +
    `<animate attributeName="y" values="${ys}" keyTimes="${kt}" calcMode="discrete" dur="${r(total)}s" fill="freeze"/>` +
    `<animate attributeName="opacity" values="1;0" calcMode="discrete" dur="1.05s" repeatCount="indefinite"/>` +
    `</rect>`;

  // Window chrome: rounded frame, title bar, three traffic-light dots, title.
  const chrome =
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="10" fill="${COLORS.bg}" stroke="${COLORS.border}"/>` +
    `<path d="M0.5 ${BAR_H} V10.5 a10 10 0 0 1 10 -10 H${WIDTH - 10.5} a10 10 0 0 1 10 10 V${BAR_H} Z" fill="${COLORS.bar}"/>` +
    `<line x1="0.5" y1="${BAR_H}" x2="${WIDTH - 0.5}" y2="${BAR_H}" stroke="${COLORS.border}"/>` +
    `<circle cx="20" cy="17" r="5.5" fill="${COLORS.crimson}"/>` +
    `<circle cx="38" cy="17" r="5.5" fill="${COLORS.amber}"/>` +
    `<circle cx="56" cy="17" r="5.5" fill="${COLORS.cyan}"/>` +
    `<text x="${WIDTH / 2}" y="21.5" text-anchor="middle" fill="${COLORS.muted}" font-size="12">${esc(title)}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${esc(title)}">\n` +
    `<title>${esc(title)}</title>\n` +
    `<g font-family="ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" font-size="${FONT}">\n` +
    `${chrome}\n<defs>${defs.join("")}</defs>\n${body.join("\n")}\n${cursor}\n</g>\n</svg>\n`
  );
}
