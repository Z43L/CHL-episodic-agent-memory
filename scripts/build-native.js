const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "build", "Release");
const outFile = path.join(outDir, "chl_addon.node");
const source = path.join(root, "native", "chl_addon.cc");
const includeDir =
  process.env.NODE_INCLUDE_DIR ||
  path.resolve(path.dirname(process.execPath), "..", "include", "node");

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

if (!fs.existsSync(path.join(includeDir, "node_api.h"))) {
  console.error(`node_api.h not found in include directory: ${includeDir}`);
  console.error("Set NODE_INCLUDE_DIR to a valid Node headers path.");
  process.exit(1);
}

const compiler = process.env.CXX || "clang++";
const result = spawnSync(compiler, args, { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`built ${outFile}`);
