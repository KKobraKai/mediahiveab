import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test("no secrets referenced in public bundle", () => {
  const files = walk(path.join(process.cwd(), "public"));
  const bad = [];
  const patterns = [/OPENAI_API_KEY/i, /SYNERGI_/i, /ANTHROPIC_/i];
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    if (patterns.some(re => re.test(s))) bad.push(f);
  }
  assert.equal(bad.length, 0, "Secret-like identifiers found in public files: " + bad.join(", "));
});

