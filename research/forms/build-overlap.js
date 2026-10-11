// Merges the per-form field JSON files into an overlap matrix.
// Usage: node research/forms/build-overlap.js
// Writes: research/forms/overlap.csv and research/forms/overlap.md
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const keys = fs.readFileSync(path.join(dir, "FIELDS.md"), "utf8")
  .split("\n").map(l => l.match(/^- (\w+)/)).filter(Boolean).map(m => m[1]);
const sections = [];
fs.readFileSync(path.join(dir, "FIELDS.md"), "utf8").split("\n").forEach(l => {
  const h = l.match(/^## (.+)/);
  const k = l.match(/^- (\w+)/);
  if (h) sections.push({ name: h[1], keys: [] });
  else if (k && sections.length) sections[sections.length - 1].keys.push(k[1]);
});

const forms = {};
for (const f of ["county-forms.json", "state-federal-forms.json", "local-forms.json"]) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.warn("missing", f); continue; }
  Object.assign(forms, JSON.parse(fs.readFileSync(p, "utf8")));
}
const names = Object.keys(forms);
const val = (form, k) => String((forms[form].fields || {})[k] || "N").toUpperCase()[0];
const score = v => (v === "Y" ? 1 : v === "P" ? 0.5 : 0);

// How many forms ask for each field
const fieldStats = keys.map(k => {
  const y = names.filter(n => val(n, k) === "Y").length;
  const p = names.filter(n => val(n, k) === "P").length;
  return { k, y, p, share: (y + p * 0.5) / names.length };
}).sort((a, b) => b.share - a.share);

// Coverage: if you collect the "core" fields once (asked by at least half the forms),
// what share of each form's questions is already answered?
const core = new Set(fieldStats.filter(f => f.share >= 0.5).map(f => f.k));
const formStats = names.map(n => {
  const asked = keys.filter(k => val(n, k) !== "N");
  const weight = asked.reduce((s, k) => s + score(val(n, k)), 0);
  const covered = asked.filter(k => core.has(k)).reduce((s, k) => s + score(val(n, k)), 0);
  return { n, form: forms[n].form, confidence: forms[n].confidence, asked: asked.length, coverage: weight ? covered / weight : 0, extra: forms[n].extra || [] };
}).sort((a, b) => b.coverage - a.coverage);

// Coverage if you collect EVERY field once: everything except form-specific "extra" questions
const csv = ["field," + names.join(",")].concat(keys.map(k => k + "," + names.map(n => val(n, k)).join(","))).join("\n");
fs.writeFileSync(path.join(dir, "overlap.csv"), csv + "\n");

const pct = x => Math.round(x * 100) + "%";
let md = `# How much do the benefit forms overlap?\n\nBuilt by \`build-overlap.js\` from ${names.length} application forms. Y = asked, P = partly or only in some cases, N = not asked.\n\n`;
md += `## Fields ranked by how many forms ask for them\n\n| Field | Forms asking (Y) | Partly (P) | Share |\n|---|---|---|---|\n`;
fieldStats.forEach(f => { md += `| ${f.k}${core.has(f.k) ? " **(core)**" : ""} | ${f.y} | ${f.p} | ${pct(f.share)} |\n`; });
md += `\n**Core fields** = asked by at least half the forms (${core.size} of ${keys.length}).\n\n## How much of each form the core fields cover\n\n| Form | Fields asked | Covered by core | Confidence |\n|---|---|---|---|\n`;
formStats.forEach(f => { md += `| ${f.n} (${f.form}) | ${f.asked} | ${pct(f.coverage)} | ${f.confidence || ""} |\n`; });
md += `\n## Questions unique to each form (not in the shared list)\n\n`;
formStats.forEach(f => { if (f.extra.length) md += `- **${f.n}:** ${f.extra.join("; ")}\n`; });
md += `\n## Full matrix\n\n| Field | ${names.join(" | ")} |\n|---|${names.map(() => "---").join("|")}|\n`;
sections.forEach(s => {
  md += `| **${s.name}** |${names.map(() => " ").join("|")}|\n`;
  s.keys.forEach(k => { md += `| ${k} | ${names.map(n => val(n, k)).join(" | ")} |\n`; });
});
fs.writeFileSync(path.join(dir, "overlap.md"), md);

console.log(JSON.stringify({
  forms: names.length, fields: keys.length, core: [...core],
  top: fieldStats.slice(0, 15).map(f => `${f.k} ${pct(f.share)}`),
  rare: fieldStats.filter(f => f.share < 0.2).map(f => `${f.k} ${pct(f.share)}`),
  coverage: formStats.map(f => `${f.n} ${pct(f.coverage)} (${f.asked} fields, ${f.confidence})`)
}, null, 1));
