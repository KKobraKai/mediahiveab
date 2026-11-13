import test from "node:test";
import assert from "node:assert/strict";
import { SynergyItem, SynergyResponse, isLikelyGeneric, evalValueModel, recomputePartyRanges } from "../functions/_lib/schema.js";

test("schema validates a minimal valid item", () => {
  const item = {
    id: "x1",
    name: "Paketaffär",
    oneLine: "Sälj totalpaket",
    howItWorks: "A säljer, B levererar",
    parties: [
      { name: "A", valueKrRange: [1000, 5000], gets: ["Fler affärer"] },
      { name: "B", valueKrRange: [500, 3000], gets: ["Pipeline"] }
    ],
    domino: ["Nästa aktör"],
    firstSteps: ["1","2","3"],
    introMessage: "Hej!",
    bniPitch: "Söker partner",
    assumptions: { a: { label: "Antal", value: 10, unit: "st" } },
    valueModel: { A: { minFormula: "a*100", maxFormula: "a*300" }, B: { minFormula: "a*50", maxFormula: "a*200" } }
  };
  assert.equal(SynergyItem.validate(item), null);
  const recomputed = recomputePartyRanges(item);
  assert.ok(recomputed.A[0] === 1000 && recomputed.A[1] === 3000);
});

test("response-level validation", () => {
  const r = { matches: [{ id: "1", name: "x", oneLine: "y", howItWorks: "z", parties: [{ name: "A", valueKrRange: [1,2], gets: ["x"] }, { name: "B", valueKrRange: [1,2], gets: ["y"] }], domino: [], firstSteps: ["1","2","3"], introMessage: "i", bniPitch: "p", assumptions: { a: { label: "L", value: 1 } }, valueModel: { A: { minFormula: "a*1", maxFormula: "a*1" }, B: { minFormula: "a*1", maxFormula: "a*1" } } }], sources: ["SCB"] };
  assert.equal(SynergyResponse.validate(r), null);
});

test("generic idea detector", () => {
  assert.equal(isLikelyGeneric("Starta ett nyhetsbrev och en referral-kampanj"), true);
  assert.equal(isLikelyGeneric("Tak + hängrännor paket – komplett takjobb"), false);
});

test("formula eval guards", () => {
  assert.throws(() => evalValueModel({ a: { value: 1 } }, "process.exit()"));
});

