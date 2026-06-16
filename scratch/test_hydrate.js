const fs = require("node:fs");
const readline = require("node:readline");
const path = require("node:path");
const { NativeCHL } = require("../src/native");

async function run() {
  console.log("Initializing NativeCHL...");
  // Construct NativeCHL with no persistPath to avoid automatic hydration
  const chl = new NativeCHL({ persistPath: null });
  console.log("Native binding exists:", !!chl.engine);
  
  const memoryPath = path.resolve("./chl-memory-data/Z1-Code-Reasoning.memory");
  console.log("Reading memory file from:", memoryPath);
  
  const stream = fs.createReadStream(memoryPath, { encoding: "utf8" });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  
  let count = 0;
  const startTime = Date.now();
  let lastTime = startTime;
  
  for await (const line of reader) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    
    if (event.type === "remember") {
      chl.remember(event.text, event.payload, event.metadata);
    } else if (event.type === "learn") {
      chl.learn(event.text, event.reward);
    }
    
    count++;
    if (count % 100 === 0) {
      const now = Date.now();
      const diff = now - lastTime;
      const elapsed = now - startTime;
      console.log(`Processed ${count} entries. Last 100 took: ${diff}ms. Total elapsed: ${elapsed}ms`);
      lastTime = now;
    }
  }
  
  console.log(`Finished! Processed ${count} entries in ${Date.now() - startTime}ms`);
}

run().catch(console.error);
