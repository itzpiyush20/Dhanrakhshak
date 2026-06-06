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

// Recursively find transcript.jsonl files
const findTranscripts = (dir, results = []) => {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findTranscripts(fullPath, results);
    } else if (file === 'transcript.jsonl') {
      results.push(fullPath);
    }
  }
  return results;
};

// 1. Gather all transcripts
const brainDir = 'C:\\Users\\itzpi\\.gemini\\antigravity\\brain';
const transcripts = findTranscripts(brainDir);
console.log(`Found ${transcripts.length} transcript logs.`);

const edits = [];

// 2. Scan all transcript logs for edits to DashboardPage
for (const filePath of transcripts) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    
    // Skip the current turn's failed edit at step 2929
    if (filePath.includes('77dbf431-84e9-4a57-b8f8-1cb98ae5dcd3') && i >= 2903) {
      continue;
    }
    
    try {
      const step = JSON.parse(lines[i]);
      if (step.source === 'MODEL' && step.tool_calls) {
        for (const tc of step.tool_calls) {
          if (tc.args && tc.args.TargetFile && tc.args.TargetFile.includes('DashboardPage.tsx')) {
            edits.push({
              timestamp: new Date(step.created_at || 0).getTime(),
              createdAtStr: step.created_at,
              tool: tc.name,
              args: tc.args,
              logFile: path.basename(path.dirname(path.dirname(filePath)))
            });
          }
        }
      }
    } catch (e) {}
  }
}

// 3. Sort edits chronologically
edits.sort((a, b) => a.timestamp - b.timestamp);
console.log(`Gathered ${edits.length} edits to replay.`);

// 4. Read baseline
const baselinePath = path.join(__dirname, 'src/pages/DashboardPage.tsx');
let fileContent = fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n').trim();
console.log('Baseline file length:', fileContent.length, 'lines:', fileContent.split('\n').length);

let appliedCount = 0;

// 5. Replay edits
for (let idx = 0; idx < edits.length; idx++) {
  const edit = edits[idx];
  const { tool, args, createdAtStr, logFile } = edit;
  
  if (tool === 'replace_file_content') {
    const target = cleanString(args.TargetContent);
    const replacement = cleanString(args.ReplacementContent);
    
    if (fileContent.includes(target)) {
      fileContent = fileContent.replace(target, replacement);
      appliedCount++;
      console.log(`[${createdAtStr}][${logFile}] Applied replace_file_content`);
    } else {
      console.warn(`[${createdAtStr}][${logFile}] Warning: target not found for replace_file_content`);
    }
  } else if (tool === 'multi_replace_file_content') {
    const chunks = args.ReplacementChunks;
    let parsedChunks = chunks;
    if (typeof chunks === 'string') {
      try {
        parsedChunks = JSON.parse(cleanString(chunks));
      } catch (e) {
        parsedChunks = chunks;
      }
    }
    
    let success = 0;
    for (const chunk of parsedChunks) {
      const target = cleanString(chunk.TargetContent);
      const replacement = cleanString(chunk.ReplacementContent);
      if (fileContent.includes(target)) {
        fileContent = fileContent.replace(target, replacement);
        success++;
        appliedCount++;
      } else {
        console.warn(`[${createdAtStr}][${logFile}] Warning: chunk target not found`);
      }
    }
    console.log(`[${createdAtStr}][${logFile}] Applied multi_replace_file_content: ${success}/${parsedChunks.length}`);
  }
}

console.log('Replay completed. Total replacements applied:', appliedCount);
console.log('Final file length:', fileContent.length, 'lines:', fileContent.split('\n').length);

// 6. Write final file
fs.writeFileSync(baselinePath, fileContent.replace(/\n/g, '\r\n'), 'utf8');
console.log('Restored DashboardPage.tsx successfully!');
