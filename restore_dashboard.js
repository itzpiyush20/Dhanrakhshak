import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to normalize and unescape double-escaped strings
const cleanString = (str) => {
  if (typeof str !== 'string') return '';
  let cleaned = str.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    try {
      cleaned = JSON.parse(cleaned);
    } catch (e) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
  }
  // Convert escaped sequence representations
  cleaned = cleaned
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  return cleaned.replace(/\r\n/g, '\n').trim();
};

// 1. Read the baseline file (restored 402-line version)
const baselinePath = path.join(__dirname, 'src/pages/DashboardPage.tsx');
let fileContent = fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n').trim();
console.log('Baseline file length:', fileContent.length, 'lines:', fileContent.split('\n').length);

// 2. Read the transcript log
const logPath = 'C:\\Users\\itzpi\\.gemini\\antigravity\\brain\\77dbf431-84e9-4a57-b8f8-1cb98ae5dcd3\\.system_generated\\logs\\transcript.jsonl';
const logLines = fs.readFileSync(logPath, 'utf8').split('\n');

let replacementCount = 0;

for (let i = 0; i < logLines.length; i++) {
  if (!logLines[i]) continue;
  
  // Skip our own edits starting at index 2903
  if (i >= 2903) {
    continue;
  }
  
  try {
    const step = JSON.parse(logLines[i]);
    if (step.source === 'MODEL' && step.tool_calls) {
      for (const tc of step.tool_calls) {
        if (tc.args && tc.args.TargetFile && tc.args.TargetFile.includes('DashboardPage.tsx')) {
          if (tc.name === 'replace_file_content') {
            const target = cleanString(tc.args.TargetContent);
            const replacement = cleanString(tc.args.ReplacementContent);
            
            if (fileContent.includes(target)) {
              fileContent = fileContent.replace(target, replacement);
              replacementCount++;
              console.log(`[Step ${i}] Replayed replace_file_content success`);
            } else {
              console.warn(`[Step ${i}] Warning: TargetContent not found! target starts with: ${target.substring(0, 40)}`);
            }
          } else if (tc.name === 'multi_replace_file_content') {
            const chunks = tc.args.ReplacementChunks;
            let successChunks = 0;
            
            // Reconstruct replacement chunks if they are string-encoded
            let parsedChunks = chunks;
            if (typeof chunks === 'string') {
              try {
                parsedChunks = JSON.parse(cleanString(chunks));
              } catch(e) {
                parsedChunks = chunks;
              }
            }
            
            for (const chunk of parsedChunks) {
              const target = cleanString(chunk.TargetContent);
              const replacement = cleanString(chunk.ReplacementContent);
              if (fileContent.includes(target)) {
                fileContent = fileContent.replace(target, replacement);
                successChunks++;
                replacementCount++;
              } else {
                console.warn(`[Step ${i}] Chunk target not found! target starts with: ${target.substring(0, 40)}`);
              }
            }
            console.log(`[Step ${i}] Replayed multi_replace_file_content, active chunks: ${successChunks}/${parsedChunks.length}`);
          }
        }
      }
    }
  } catch (e) {
    // Ignore invalid JSON lines
  }
}

console.log('Replay completed. Total replacements applied:', replacementCount);
console.log('Restored file length:', fileContent.length, 'lines:', fileContent.split('\n').length);

// 3. Save the restored file content
fs.writeFileSync(baselinePath, fileContent.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully wrote restored content to DashboardPage.tsx');
