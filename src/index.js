const { CHL: JSCHL } = require("./chl");
const { AssociativeMemory } = require("./memory");
const {
  bindVectors,
  bundleVectors,
  prototypeVectorFromText,
  similarity,
  vectorFromSeed,
} = require("./hypervector");
const {
  extractFeatures,
  hammingDistance,
  hammingSimilarity,
  semanticHash,
  semanticHashFromText,
} = require("./simhash");
const {
  normalizeText,
  popcount32,
  popcountWords,
  stableHash32,
  tokenize,
} = require("./utils");
const { NativeCHL } = require("./native");
const { createServer } = require("./server");
const { callTool, createMcpContext, handleMcpMessage, listResources, listTools, readResource } = require("./mcp");
const {
  archiveToBase64,
  base64ToArchive,
  decodeArchiveBinary,
  encodeArchiveBinary,
  readArchiveBinary,
  writeArchiveBinary,
} = require("./backup");
const {
  conceptualizeTokens,
  getConceptMap,
  learnConceptPairsFromExamples,
  loadLexiconState,
  serializeConceptMap,
  saveLexiconState,
  serializePairList,
} = require("./concepts");

module.exports = {
  CHL: NativeCHL,
  JSCHL,
  AssociativeMemory,
  bindVectors,
  bundleVectors,
  extractFeatures,
  hammingDistance,
  hammingSimilarity,
  normalizeText,
  popcount32,
  popcountWords,
  prototypeVectorFromText,
  semanticHash,
  semanticHashFromText,
  similarity,
  stableHash32,
  createServer,
  callTool,
  createMcpContext,
  handleMcpMessage,
  listResources,
  listTools,
  readResource,
  archiveToBase64,
  base64ToArchive,
  decodeArchiveBinary,
  encodeArchiveBinary,
  conceptualizeTokens,
  getConceptMap,
  learnConceptPairsFromExamples,
  loadLexiconState,
  readArchiveBinary,
  serializeConceptMap,
  saveLexiconState,
  serializePairList,
  tokenize,
  vectorFromSeed,
  writeArchiveBinary,
};
