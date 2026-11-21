// File: content.mjs
// What it does: EDITABLE — the lines shown in the animated terminal at the top
//   of the profile README: current operations (`cat ~/current-ops.log`),
//   featured projects (`ls ~/projects --featured`), the
//   rest of the project list, then the "initializing next project" sequence
//   with a looping progress bar. Projects mirror the shadow-port portfolio;
//   client products use generic names on purpose.
//   Segment = [text, colorKey]; colorKey is a key of COLORS in ./svg.mjs.
//   Keep every line ≤ 100 characters so it fits the 900px window.
// Requirements/dependencies: none.
// Where it's used: ./build.mjs.
// Callable exports: terminals ({ file, spec }[]).

// ── Helpers so each line reads like the terminal it draws ──────────────────
const prompt = (cmd, comment) => ({
  kind: "cmd",
  segs: [["$ ", "crimson"], [cmd, "fg"], ...(comment ? [["  # " + comment, "muted"]] : [])],
});
const out = (...segs) => ({ kind: "out", segs });
const blank = { kind: "blank" };

/** One "current operations" line: green [+], plain text, tech in cyan. */
const op = (text, tech, tail) =>
  out(["  [+] ", "ok"], [text, "fg"], [tech, "cyan"], ...(tail ? [[tail, "fg"]] : []));

// Role → colour, so ownership is readable at a glance.
const ROLE_COLOR = { built: "ok", "co-built": "amber", devops: "cyan" };

/** One row of the featured-projects table: name | role | stack. */
const project = (name, role, stack) =>
  out(["  " + name.padEnd(31), "fg"], [role.padEnd(11), ROLE_COLOR[role] ?? "fg"], [stack, "muted"]);

/** Lay names out in columns of `width`, `perRow` per line (like `ls`). */
const columns = (items, perRow = 4, width = 22) => {
  const rows = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(out(...items.slice(i, i + perRow).map(([name, color]) => ["  " + name.padEnd(width - 2), color])));
  }
  return rows;
};

// Remaining work: client products in white, personal & university in grey.
const more = [
  ...["workflow-crm", "property-search", "browser-dialer", "seo-crawler", "client-dashboards",
    "document-vault", "lead-capture", "document-ai-apis", "voice-agent", "image-ai-apis"].map((n) => [n, "fg"]),
  ...["secret-keygen", "money-manager", "predictive-maint", "android-app", "private-network",
    "smog-detector", "skin-lesion-ai"].map((n) => [n, "muted"]),
];

export const terminals = [
  {
    file: "terminal.svg",
    spec: {
      title: "shadow@islamabad: ~",
      lines: [
        prompt("cat ~/current-ops.log"),
        op("shipping client products end to end on ", "next.js · fastapi · mongodb"),
        op("running devops: ", "docker · github actions · per-tenant deploys"),
        op("building ai services: ", "ocr pipelines · langchain · voice agents"),
        op("automating workflows with ", "n8n and agents"),
        op("wiring ", "sso", " between products and shared micro-apis"),
        blank,
        prompt("ls ~/projects --featured"),
        out(["  " + "PROJECT".padEnd(31), "cyan"], ["ROLE".padEnd(11), "cyan"], ["STACK", "cyan"]),
        project("tax-strategy-portal", "built", "next.js · fastapi · mongodb · ocr"),
        project("compliance-training-academy", "built", "next.js · fastapi · mongodb"),
        project("ai-marketing-studio", "built", "next.js · fastapi · mongodb · langchain"),
        project("whitelabel-marketing-crm", "co-built", "next.js · fastapi · mongodb · docker"),
        project("platform-devops-ci", "devops", "docker · compose · github actions"),
        project("agentic-content-dashboards", "built", "next.js · node.js · n8n"),
        blank,
        prompt("ls ~/projects/more", "10 products · 7 personal & university"),
        ...columns(more),
        blank,
        prompt("git init next-project && cd next-project"),
        out(["> ", "crimson"], ["INITIALIZING NEXT PROJECT...", "cyan"]),
        out(["> ", "crimson"], ["stack resolved: ", "muted"], ["next.js · fastapi · mongodb · docker", "fg"]),
        { kind: "progress", segs: [["> ", "crimson"], ["building ", "muted"]] },
        out(["motd: ", "amber"], ["main quest is open. bring a build or say hello.", "fg"]),
        { kind: "cmd", segs: [["$ ", "crimson"]] },
      ],
    },
  },
];
