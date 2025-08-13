const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const MODEL = process.env.TRANSLATE_MODEL || 'openai/gpt-4o-mini';
const MAX_CHARS = Math.max(2000, parseInt(process.env.TRANSLATE_MAX_CHARS || '10000', 10));
const CONCURRENCY = Math.max(1, parseInt(process.env.TRANSLATE_CONCURRENCY || '4', 10));

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
  if (stats.isFile()) return isMarkdown(targetPath) ? [targetPath] : [];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'pt-BR' && path.basename(path.dirname(entryPath)) === 'docs') continue;
      files.push(...listMarkdownFilesRecursive(entryPath));
    } else if (entry.isFile() && isMarkdown(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function computeOutputPath(inputFile) {
  const cwd = process.cwd();
  const docsRoot = path.join(cwd, 'docs');
  const normalized = path.resolve(inputFile);
  if (!normalized.startsWith(docsRoot + path.sep)) {
    const outDir = path.join(docsRoot, 'pt-BR');
    return path.join(outDir, path.basename(normalized));
  }
  const relToDocs = path.relative(docsRoot, normalized);
  const parts = relToDocs.split(path.sep);
  if (parts[0] === 'pt-BR') return null;
  if (parts[0] === 'en') parts.shift();
  const outRel = path.join('pt-BR', ...parts);
  return path.join(docsRoot, outRel);
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

function splitFrontmatter(content) {
  if (content.startsWith('---\n')) {
    const idx = content.indexOf('\n---\n', 4);
    if (idx !== -1) {
      const fm = content.slice(0, idx + 5);
      const body = content.slice(idx + 5);
      return { frontmatter: fm, body };
    }
  }
  return { frontmatter: '', body: content };
}

function chunkMarkdownByStructure(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const lines = text.split('\n');
  const chunks = [];
  let current = [];
  let currentLen = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) inFence = !inFence;
    const prospectiveLen = currentLen + line.length + 1;
    const isBoundary = !inFence && (trimmed.startsWith('#') || trimmed === '' || trimmed.startsWith('>') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed));
    const shouldFlush = prospectiveLen > maxChars && isBoundary && current.length > 0;
    if (shouldFlush) {
      chunks.push(current.join('\n'));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

function buildMessagesForChunk(chunk) {
  return [
    {
      role: 'system',
      content:
        'You are a careful translator. Translate from English to Brazilian Portuguese using dynamic equivalence. Preserve theological terminology and the original tone. Keep the exact Markdown structure and formatting, including headings, lists, blockquotes, links, inline code, and code fences. Do NOT translate code blocks or YAML frontmatter. Return ONLY the translated Markdown for the provided content.'
    },
    {
      role: 'user',
      content:
        'Translate the following Markdown content from English to Brazilian Portuguese. Keep structure and formatting identical. Do not wrap the output with any extra characters. Content:\n\n' + chunk
    }
  ];
}

async function translateChunk(chunk) {
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
      temperature: 0.2,
      messages: buildMessagesForChunk(chunk)
    },
    { headers }
  );
  return String(response.data?.choices?.[0]?.message?.content || '').trim();
}

async function translateBodyMarkdown(body) {
  const chunks = chunkMarkdownByStructure(body, MAX_CHARS);
  const chunkConcurrency = Math.min(
    chunks.length,
    Math.max(1, parseInt(process.env.TRANSLATE_CHUNK_CONCURRENCY || String(CONCURRENCY), 10))
  );
  const results = await runWithConcurrency(
    chunks,
    async (chunk) => {
      return await translateChunk(chunk);
    },
    chunkConcurrency
  );
  return results.join('\n');
}

async function translateFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const endsWithNewline = source.endsWith('\n');
  const { frontmatter, body } = splitFrontmatter(source);
  const translatedBody = await translateBodyMarkdown(body);
  const combined = frontmatter ? frontmatter + translatedBody : translatedBody;
  return endsWithNewline && !combined.endsWith('\n') ? combined + '\n' : combined;
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let currentIndex = 0;
  async function runner() {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  const runners = new Array(concurrency).fill(0).map(() => runner());
  await Promise.all(runners);
  return results;
}

async function main() {
  assertApiKey();
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: bun run translate -- <file-or-directory>');
    process.exit(1);
  }
  const absoluteInput = path.isAbsolute(inputArg) ? inputArg : path.join(process.cwd(), inputArg);
  if (!fs.existsSync(absoluteInput)) {
    console.error(`Input path not found: ${absoluteInput}`);
    process.exit(1);
  }
  const files = listMarkdownFilesRecursive(absoluteInput);
  if (files.length === 0) {
    console.log('No markdown files found to process.');
    process.exit(0);
  }
  console.log(`Selected model: ${MODEL}`);
  console.log(`Max chunk chars: ${MAX_CHARS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Discovered ${files.length} markdown file(s).`);

  const startedAt = Date.now();
  let completed = 0;

  await runWithConcurrency(
    files,
    async (filePath) => {
      const rel = path.relative(process.cwd(), filePath);
      const outPath = computeOutputPath(filePath);
      if (!outPath) return { file: rel, skipped: true };
      const outDir = path.dirname(outPath);
      const start = Date.now();
      console.log(`[START] ${rel}`);
      try {
        const translated = await translateFile(filePath);
        safeMkdir(outDir);
        fs.writeFileSync(outPath, translated, 'utf8');
        const ms = Date.now() - start;
        completed += 1;
        console.log(`[END]   ${rel} -> ${path.relative(process.cwd(), outPath)} (${ms} ms) [${completed}/${files.length}]`);
        return { file: rel, ok: true };
      } catch (err) {
        const ms = Date.now() - start;
        completed += 1;
        console.error(`[ERROR] ${rel} (${ms} ms): ${err?.message || String(err)} [${completed}/${files.length}]`);
        return { file: rel, ok: false, error: err?.message || String(err) };
      }
    },
    CONCURRENCY
  );

  const totalSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Total time: ${totalSeconds} s`);
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});

