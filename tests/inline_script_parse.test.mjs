import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function extractScripts(html) {
  const out = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

test("all inline scripts parse with Function constructor", () => {
  const files = ["public/synergimotor/index.html", "public/grannaffar/index.html"];
  for (const f of files) {
    const s = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    const scripts = extractScripts(s);
    for (const code of scripts) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(code);
      } catch (e) {
        assert.fail(`Script in ${f} failed to parse: ${e.message}`);
      }
    }
  }
});

