import fs from 'fs';

const logPath = 'C:\\Users\\itzpi\\.gemini\\antigravity\\brain\\77dbf431-84e9-4a57-b8f8-1cb98ae5dcd3\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');
const obj = JSON.parse(lines[996]);
const tc = obj.tool_calls[0];
const chunksStr = tc.args.ReplacementChunks;

console.log('Substring around pos 2044:');
const start = Math.max(0, 2020);
const end = Math.min(chunksStr.length, 2068);
console.log('Chars:', chunksStr.substring(start, end));
for (let i = start; i < end; i++) {
  console.log(`Pos ${i}: Char ${JSON.stringify(chunksStr[i])} (Code: ${chunksStr.charCodeAt(i)})`);
}
