const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const MODEL = process.env.GLOSSARY_MODEL || 'openai/gpt-4o-mini';
const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'pt-BR');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'glossary.json');
const ROOT_LEGACY_GLOSSARY = path.join(process.cwd(), 'glossary.json');

function assertApiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set. Create a .env with OPENROUTER_API_KEY=...');
    process.exit(1);
  }
}

function isMarkdown(filePath) {
  return filePath.toLowerCase().endsWith('.md');
}

function listMarkdownFilesRecursive(targetPath) {
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    return isMarkdown(targetPath) ? [targetPath] : [];
  }
  const files = [];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'pt-BR' && path.basename(path.dirname(entryPath)) === 'docs') {
        continue;
      }
      files.push(...listMarkdownFilesRecursive(entryPath));
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function safeMkdir(dirPath) {
  if (fs.existsSync(dirPath)) {
    if (!fs.statSync(dirPath).isDirectory()) {
      console.error(`Path exists and is not a directory: ${dirPath}`);
      process.exit(1);
    }
    return;
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function readExistingGlossary() {
  let items = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const raw = fs.readFileSync(OUTPUT_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch (_) {}
  } else if (fs.existsSync(ROOT_LEGACY_GLOSSARY)) {
    try {
      const raw = fs.readFileSync(ROOT_LEGACY_GLOSSARY, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch (_) {}
  }
  return items;
}

function writeGlossary(items) {
  safeMkdir(OUTPUT_DIR);
  const data = JSON.stringify(items, null, 2);
  fs.writeFileSync(OUTPUT_FILE, data + '\n', 'utf8');
}

function dedupeMerge(existingItems, newItems) {
  const termToItem = new Map();
  for (const item of existingItems) {
    if (!item || typeof item !== 'object') continue;
    const term = String(item.term || '').trim();
    const explanation = String(item.explanation || '').trim();
    if (!term || !explanation) continue;
    termToItem.set(term.toLowerCase(), { term, explanation });
  }
  for (const item of newItems) {
    if (!item || typeof item !== 'object') continue;
    const term = String(item.term || '').trim();
    const explanation = String(item.explanation || '').trim();
    if (!term || !explanation) continue;
    const key = term.toLowerCase();
    if (!termToItem.has(key)) {
      termToItem.set(key, { term, explanation });
    }
  }
  return Array.from(termToItem.values()).sort((a, b) => a.term.localeCompare(b.term));
}

function chunkText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

async function extractTermsFromText(text) {
  const chunks = chunkText(text, 10000);
  const results = [];
  for (const chunk of chunks) {
    const headers = {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    };
    if (process.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
    if (process.env.OPENROUTER_APP_NAME) headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise terminologist. Identify archaic or uncommon English terms and theological terms that require explanation. Return ONLY a JSON array. Each item must have keys: term, explanation. Explanations must be concise, neutral, and in English.'
          },
          {
            role: 'user',
            content:
              'From the following content, extract terms that are archaic, uncommon today, or theological, that may require explanation. Return a JSON array ONLY, with objects: {"term": string, "explanation": string}. Avoid duplicates. Content:\n\n' +
              chunk
          }
        ]
      },
      { headers }
    );
    const textOut = response.data?.choices?.[0]?.message?.content || '[]';
    const parsed = parseJsonArray(textOut);
    for (const item of parsed) {
      if (item && item.term && item.explanation) results.push({ term: String(item.term), explanation: String(item.explanation) });
    }
  }
  return results;
}

function parseJsonArray(text) {
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('[')) return JSON.parse(trimmed);
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
  } catch (_) {}
  return [];
}

async function main() {
  assertApiKey();
  const overallStart = Date.now();
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: bun run glossary -- <file-or-directory>');
    process.exit(1);
  }
  const inputPath = path.isAbsolute(inputArg) ? inputArg : path.join(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input path not found: ${inputPath}`);
    process.exit(1);
  }
  const files = listMarkdownFilesRecursive(inputPath);
  if (files.length === 0) {
    console.log('No markdown files found to process.');
    process.exit(0);
  }
  console.log(`Selected model: ${MODEL}`);
  console.log(`Discovered ${files.length} markdown file(s).`);
  const existing = readExistingGlossary();
  const concurrency = Math.max(1, parseInt(process.env.GLOSSARY_CONCURRENCY || '4', 10));
  let aggregatedNew = [];
  const results = await runWithConcurrency(
    files,
    async (filePath) => {
      const rel = path.relative(process.cwd(), filePath);
      const started = Date.now();
      console.log(`[START] ${rel}`);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const terms = await extractTermsFromText(content);
        const ended = Date.now();
        const ms = ended - started;
        console.log(`[END]   ${rel} (${ms} ms)`);
        return terms;
      } catch (err) {
        const ended = Date.now();
        const ms = ended - started;
        console.error(`[ERROR] ${rel} (${ms} ms): ${err?.message || String(err)}`);
        return [];
      }
    },
    concurrency
  );
  for (const arr of results) {
    aggregatedNew = dedupeMerge(aggregatedNew, arr);
  }
  const merged = dedupeMerge(existing, aggregatedNew);
  writeGlossary(merged);
  const added = merged.length - existing.length;
  console.log(`Processed ${files.length} file(s). Added ${added} new term(s). Total: ${merged.length}.`);
  console.log(`Glossary: ${OUTPUT_FILE}`);
  const totalSeconds = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log(`Total time: ${totalSeconds} s`);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});


async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let currentIndex = 0;
  async function runOne() {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) return;
      const item = items[index];
      results[index] = await worker(item);
    }
  }
  const runners = new Array(concurrency).fill(0).map(() => runOne());
  await Promise.all(runners);
  return results;
}


