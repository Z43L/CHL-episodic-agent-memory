const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "build", "Release");
const outFile = path.join(outDir, "chl_addon.node");
const source = path.join(root, "native", "chl_addon.cc");
const includeDir = path.resolve(path.dirname(process.execPath), "..", "include", "node");

fs.mkdirSync(outDir, { recursive: true });

const args = [
  "-std=c++20",
  "-O3",
  "-fPIC",
  "-shared",
  source,
  `-I${includeDir}`,
  "-o",
  outFile,
  "-undefined",
  "dynamic_lookup",
];

const compiler = process.env.CXX || "clang++";
const result = spawnSync(compiler, args, { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`built ${outFile}`);
