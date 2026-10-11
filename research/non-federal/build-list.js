// Combines every non-federal program (applied for at a state, county, city or local office) into one list.
// Usage: node research/non-federal/build-list.js  ->  writes ALL.md and all-programs.json
const fs = require("fs");
const path = require("path");
const dir = __dirname;

// Programs already researched in research/ca-*.md and research/apply-*.md
const BASE = [
  ["CalFresh", "county", "County social services", "Food", [["benefitscal.com", "https://benefitscal.com"]]],
  ["CFAP (food aid for immigrants)", "county", "County social services", "Food", [["benefitscal.com", "https://benefitscal.com"]]],
  ["CalWORKs (cash, child care, homeless help)", "county", "County social services", "Cash", [["benefitscal.com", "https://benefitscal.com"]]],
  ["General Relief / General Assistance", "county", "County social services", "Cash", [["benefitscal.com", "https://benefitscal.com"]]],
  ["CAPI (cash for immigrants)", "county", "County social services", "Cash", []],
  ["Medi-Cal (incl. pregnancy, MCAP, kids)", "county", "County social services / DHCS", "Health", [["benefitscal.com", "https://benefitscal.com"], ["coveredca.com", "https://www.coveredca.com"]]],
  ["Medicare Savings Programs", "county", "County social services", "Health", [["benefitscal.com", "https://benefitscal.com"]]],
  ["IHSS (in-home care)", "county", "County IHSS office", "Health", []],
  ["Covered California", "state", "Covered California", "Health", [["coveredca.com", "https://www.coveredca.com"]]],
  ["Unemployment Insurance", "state", "EDD", "Work and disability", [["edd.ca.gov", "https://edd.ca.gov"]]],
  ["California LifeLine", "state", "CPUC (through phone companies)", "Bills and phone", [["californialifeline.com", "https://www.californialifeline.com"]]],
  ["CalEITC, Young Child and Foster Youth Tax Credits", "state", "Franchise Tax Board", "Taxes and legal", [["ftb.ca.gov", "https://www.ftb.ca.gov"], ["CalEITC4Me", "https://caleitc4me.org"]]],
  ["Cal Grant, CA Dream Act, College Promise Grant", "state", "CSAC / colleges", "Kids and school", [["dream.csac.ca.gov", "https://dream.csac.ca.gov"]]],
  ["CARE and FERA bill discounts", "state", "CPUC (through utilities)", "Bills and phone", [["PG&E", "https://www.pge.com/care"], ["SCE", "https://www.sce.com/save-money/income-qualified-programs/care-fera"]]],
  ["HEAP energy help and weatherization", "state", "CSD (through local agencies)", "Bills and phone", [["CSD: find services", "https://www.csd.ca.gov/Pages/FindServicesInYourArea.aspx"]]],
  ["WIC", "state", "CDPH (through local WIC offices)", "Food", [["myfamily.wic.ca.gov", "https://myfamily.wic.ca.gov"]]],
  ["SUN Bucks (Summer EBT)", "state", "CDSS", "Food", [["cdss.ca.gov", "https://www.cdss.ca.gov"]]],
  ["Family PACT", "state", "DHCS (through clinics)", "Health", [["familypact.org", "https://familypact.org"]]],
  ["Section 8 and public housing", "city", "City or county housing authority", "Housing", []],
  ["Affordable-housing lotteries", "city", "City / county housing departments", "Housing", [["SF DAHLIA", "https://housing.sfgov.org"], ["LA County", "https://housing.lacounty.gov"]]],
  ["Homeless and eviction help (211, Coordinated Entry)", "local agency", "211 / county homeless services", "Housing", [["211.org", "https://www.211.org"]]],
  ["School meals, TK, State Preschool", "local agency", "School district", "Kids and school", []],
  ["Child care help", "local agency", "Resource & Referral / payment agencies", "Kids and school", [["rrnetwork.org", "https://rrnetwork.org"]]],
  ["Head Start / Early Head Start", "local agency", "Local Head Start program", "Kids and school", [["headstart.gov", "https://headstart.gov"]]],
  ["Food banks and pantries", "nonprofit", "Local food bank", "Food", [["Feeding America finder", "https://www.feedingamerica.org/find-your-local-foodbank"]]],
  ["Free / low-cost clinics", "local agency", "Community health centers", "Health", [["Find a Health Center", "https://findahealthcenter.hrsa.gov"]]],
  ["Legal aid", "nonprofit", "Legal aid offices", "Taxes and legal", [["lawhelpca.org", "https://www.lawhelpca.org"]]]
].map(([name, level, agency, category, web]) => ({ name, level, agency, category, apply_web: web, status_2026: "active", source: "research/ca-*.md, research/apply-*.md", confidence: "medium", base: true }));

const files = ["state-programs.json", "county-programs.json", "city-local-programs.json"];
const found = files.flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const all = BASE.concat(found);
fs.writeFileSync(path.join(dir, "all-programs.json"), JSON.stringify(all, null, 2) + "\n");

const LEVELS = ["state", "county", "city", "transit", "utility", "local agency", "nonprofit"];
const levelName = { state: "State", county: "County", city: "City", transit: "Transit agency", utility: "Utility", "local agency": "Local agency", nonprofit: "Nonprofit" };
const isEnded = p => !/^\s*active/i.test(p.status_2026 || "") && /\b(ended|closed|winding down|paused)\b/i.test(p.status_2026 || "");
const where = p => [p.county, p.city].filter(Boolean).join(", ");
const links = p => (p.apply_web || []).map(w => `[${w[0]}](${w[1]})`).join(" · ");

let md = `# Benefits you apply for outside the federal government (California)\n\n`;
md += `Every program here is applied for at a state, county, city or local office, not with a federal agency (Social Security, IRS, Dept. of Education or FCC). Built by \`build-list.js\` on 2026-10-11 from ${all.length} entries: ${BASE.length} researched earlier plus ${found.length} found in this search.\n\n`;
md += `**Left out because they're federal:** SSI, Extra Help, Medicare, FAFSA, federal Lifeline, and the IRS part of a tax return.\n\n`;
md += `"(U)" = unverified. Check closed waitlists and low-confidence entries on the agency's site before relying on them.\n\n`;
const counts = LEVELS.map(l => [l, all.filter(p => p.level === l).length]).filter(c => c[1]);
md += `| Run by | Programs |\n|---|---|\n` + counts.map(c => `| ${levelName[c[0]]} | ${c[1]} |`).join("\n") + `\n`;

for (const l of LEVELS) {
  const group = all.filter(p => p.level === l);
  if (!group.length) continue;
  md += `\n## ${levelName[l]} (${group.length})\n`;
  const cats = [...new Set(group.map(p => p.category))];
  for (const c of cats) {
    md += `\n### ${c}\n\n`;
    group.filter(p => p.category === c).forEach(p => {
      md += `- **${p.name}**${where(p) ? ` (${where(p)})` : ""}: ${p.agency || ""}`;
      if (isEnded(p)) md += ` · ⚠ ${p.status_2026}`;
      if (p.confidence === "low") md += ` · low confidence`;
      md += `\n`;
      if (p.who) md += `  - Who: ${p.who}\n`;
      if (p.benefit) md += `  - You get: ${p.benefit}\n`;
      if (p.apply_where) md += `  - Apply: ${p.apply_where}\n`;
      if (links(p)) md += `  - Links: ${links(p)}\n`;
      if (p.apply_phone && p.apply_phone.length) md += `  - Phone: ${p.apply_phone.join(" · ")}\n`;
      if (p.auto_via && p.auto_via.length) md += `  - Automatic if you're on: ${p.auto_via.join(", ")}\n`;
      if (!p.base && p.status_2026 && !isEnded(p)) md += `  - 2026 status: ${p.status_2026}\n`;
    });
  }
}
fs.writeFileSync(path.join(dir, "ALL.md"), md);
console.log(JSON.stringify({ total: all.length, base: BASE.length, found: found.length, byLevel: Object.fromEntries(counts),
  endedOrClosed: all.filter(isEnded).map(p => p.name + (where(p) ? " (" + where(p) + ")" : "") + ": " + p.status_2026.slice(0, 60)),
  lowConfidence: all.filter(p => p.confidence === "low").length }, null, 1));
