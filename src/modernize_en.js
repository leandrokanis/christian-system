const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const {
  assertApiKey,
  listMarkdownFilesRecursive,
  safeMkdir,
  splitFrontmatter,
  chunkMarkdownByStructure,
  runWithConcurrency
} = require('./common');

const MODEL = process.env.MODERNIZE_MODEL || 'openai/gpt-4o-mini';
const MAX_CHARS = Math.max(2000, parseInt(process.env.MODERNIZE_MAX_CHARS || '10000', 10));
const CONCURRENCY = Math.max(1, parseInt(process.env.MODERNIZE_CONCURRENCY || '4', 10));

function computeOutputPath(inputFile) {
  const cwd = process.cwd();
  const docsRoot = path.join(cwd, 'docs');
  const normalized = path.resolve(inputFile);
  if (!normalized.startsWith(docsRoot + path.sep)) {
    const outDir = path.join(docsRoot, 'en-US');
    return path.join(outDir, path.basename(normalized));
  }
  const relToDocs = path.relative(docsRoot, normalized);
  const parts = relToDocs.split(path.sep);
  if (parts[0] === 'en-US') return null;
  if (parts[0] === 'pt-BR') parts.shift();
  if (parts[0] === 'en') parts.shift();
  const outRel = path.join('en-US', ...parts);
  return path.join(docsRoot, outRel);
}

function buildMessagesForChunk(chunk) {
  return [
    {
      role: 'system',
      content:
        'You are a careful modernizer. Update 19th-century English to contemporary American English while preserving meaning, tone, and theological nuance. Maintain the exact Markdown structure and formatting, including headings, lists, blockquotes, links, inline code, and code fences. Do NOT alter code fences or YAML frontmatter. Avoid archaic vocabulary, obsolete syntax, and capitalization patterns. Return ONLY the modernized Markdown.'
    },
    {
      role: 'user',
      content:
        'Modernize the following Markdown from 19th-century English to contemporary American English. Keep structure and formatting identical. Do not wrap the output with any extra characters. Content:\n\n' + chunk
    }
  ];
}

async function modernizeChunk(chunk) {
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

async function modernizeBodyMarkdown(body) {
  const chunks = chunkMarkdownByStructure(body, MAX_CHARS);
  const chunkConcurrency = Math.min(
    chunks.length,
    Math.max(1, parseInt(process.env.MODERNIZE_CHUNK_CONCURRENCY || String(CONCURRENCY), 10))
  );
  const results = await runWithConcurrency(
    chunks,
    async (chunk) => {
      return await modernizeChunk(chunk);
    },
    chunkConcurrency
  );
  return results.join('\n');
}

async function modernizeFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const endsWithNewline = source.endsWith('\n');
  const { frontmatter, body } = splitFrontmatter(source);
  const modernizedBody = await modernizeBodyMarkdown(body);
  const combined = frontmatter ? frontmatter + modernizedBody : modernizedBody;
  return endsWithNewline && !combined.endsWith('\n') ? combined + '\n' : combined;
}

async function main() {
  assertApiKey();
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: bun run modernize:en -- <file-or-directory>');
    process.exit(1);
  }
  const absoluteInput = path.isAbsolute(inputArg) ? inputArg : path.join(process.cwd(), inputArg);
  if (!fs.existsSync(absoluteInput)) {
    console.error(`Input path not found: ${absoluteInput}`);
    process.exit(1);
  }
  const files = listMarkdownFilesRecursive(absoluteInput, { skipDocsSubdir: 'en-US' });
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
        const modernized = await modernizeFile(filePath);
        safeMkdir(outDir);
        fs.writeFileSync(outPath, modernized, 'utf8');
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


