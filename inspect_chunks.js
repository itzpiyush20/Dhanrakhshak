import fs from 'fs';

const logPath = 'C:\\Users\\itzpi\\.gemini\\antigravity\\brain\\77dbf431-84e9-4a57-b8f8-1cb98ae5dcd3\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');
const obj = JSON.parse(lines[996]);
const tc = obj.tool_calls[0];
let chunks = tc.args.ReplacementChunks;

console.log('Raw type:', typeof chunks);
if (typeof chunks === 'string') {
  console.log('Raw string length:', chunks.length);
  // Let's try parsing it
  try {
    if (chunks.startsWith('"')) {
      chunks = JSON.parse(chunks);
    } else {
      chunks = JSON.parse(chunks);
    }
  } catch (e) {
    console.log('Error in direct parsing:', e.message);
  }
}

console.log('After parsing type:', typeof chunks, 'isArray:', Array.isArray(chunks));
if (Array.isArray(chunks)) {
  console.log('Chunks array length:', chunks.length);
  console.log('First 2 chunks:', JSON.stringify(chunks.slice(0, 2), null, 2));
} else {
  console.log('Snippet of chunks:', String(chunks).substring(0, 300));
}
