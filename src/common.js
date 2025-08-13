const fs = require('fs');
const path = require('path');

function assertApiKey() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set. Create a .env with OPENROUTER_API_KEY=...');
    process.exit(1);
  }
}

function isMarkdown(filePath) {
  return filePath.toLowerCase().endsWith('.md');
}

function listMarkdownFilesRecursive(targetPath, options = {}) {
  const { skipDocsSubdir } = options;
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return isMarkdown(targetPath) ? [targetPath] : [];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (
        skipDocsSubdir &&
        entry.name === skipDocsSubdir &&
        path.basename(path.dirname(entryPath)) === 'docs'
      ) {
        continue;
      }
      files.push(...listMarkdownFilesRecursive(entryPath, options));
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
    const isBoundary =
      !inFence &&
      (trimmed.startsWith('#') ||
        trimmed === '' ||
        trimmed.startsWith('>') ||
        trimmed.startsWith('- ') ||
        /^\d+\.\s/.test(trimmed));
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

module.exports = {
  assertApiKey,
  isMarkdown,
  listMarkdownFilesRecursive,
  safeMkdir,
  splitFrontmatter,
  chunkMarkdownByStructure,
  runWithConcurrency
};


