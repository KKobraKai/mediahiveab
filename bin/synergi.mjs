#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { runSynergyChain } from "../functions/_lib/chain.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = (i + 1 < argv.length && !argv[i + 1].startsWith("--")) ? argv[++i] : "true";
      args[k] = v;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    console.log("Usage: synergi --a '<json>' --b '<json-array>' [--goal '...'] [--region '...'] [--provider mock|stdin|openai]");
    process.exit(0);
  }
  const env = {
    ...process.env,
    SYNERGI_PROVIDER: args.provider || process.env.SYNERGI_PROVIDER || "mock",
    SYNERGI_MODEL: args.model || process.env.SYNERGI_MODEL || "gpt-4o-mini",
    SYNERGI_PRICE_TABLE_JSON: process.env.SYNERGI_PRICE_TABLE_JSON || ""
  };
  // Fake KV for CLI: in-memory
  const kv = new Map();
  env.SYNERGI_KV = {
    async get(k) { return kv.get(k) || null; },
    async put(k, v, _o) { kv.set(k, v); }
  };
  const a = JSON.parse(args.a || "{}");
  const bList = JSON.parse(args.b || "[]");
  const goal = args.goal || "";
  const region = args.region || "";
  const costState = {};
  const res = await runSynergyChain({ env, a, bList, goal, region, costState });
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(2);
  }
  console.log(JSON.stringify({ ok: true, ...res.result, meta: costState }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });

