import test from "node:test";
import assert from "node:assert/strict";

test("worker exports shared class and default fetch", async () => {
  const mod = await import("../workers/counter/src/index.js");
  assert.ok(typeof mod.SynergiCounter === "function", "SynergiCounter class should be exported");
  assert.ok(mod.default && typeof mod.default.fetch === "function", "default export should have fetch");
});

test("worker re-exports the exact same SynergiCounter class (identity)", async () => {
  const worker = await import("../workers/counter/src/index.js");
  const lib = await import("../functions/_lib/counter.js");
  assert.strictEqual(worker.SynergiCounter, lib.SynergiCounter, "Worker must re-export the exact same class object");
});

