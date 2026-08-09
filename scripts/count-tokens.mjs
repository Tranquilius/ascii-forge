// Sum real token usage from the Claude Code session transcript.
// Deduplicated by assistant message id: the JSONL repeats entries (streaming/rewrites),
// so a naive sum roughly doubles the totals.
import fs from 'node:fs';
import readline from 'node:readline';

const T = process.argv[2];
const seen = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(T), crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  const msg = o.message;
  const u = msg?.usage;
  if (!u) continue;
  const id = msg.id ?? o.requestId ?? o.uuid;
  if (!id || seen.has(id)) continue;
  seen.set(id, u);
}

let inp = 0, out = 0, cw = 0, cr = 0;
for (const u of seen.values()) {
  inp += u.input_tokens ?? 0;
  out += u.output_tokens ?? 0;
  cw  += u.cache_creation_input_tokens ?? 0;
  cr  += u.cache_read_input_tokens ?? 0;
}

const fresh = inp + cw + out;          // tokens genuinely processed, excluding cache hits
const total = inp + cw + cr + out;     // every token billed/processed including cache reads

console.log(JSON.stringify({
  assistantTurns: seen.size,
  input: inp, cacheWrite: cw, cacheRead: cr, output: out,
  freshTokens: fresh, totalTokens: total,
}, null, 2));
