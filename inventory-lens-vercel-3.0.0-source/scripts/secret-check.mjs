import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const excludedDirectories = new Set([".git", "coverage", "dist", "node_modules", "release", "work"]);
const sensitiveFile = /(?:^|\/)(?:\.env(?:\..+)?|[^/]+\.(?:pem|key|p12|pfx))$/i;
const textExtensions = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml"]);
const findings = [];

function portable(path) {
  return relative(projectRoot, path).split(sep).join("/");
}

function inspectText(path, text) {
  const isTestFixture = portable(path).startsWith("tests/");
  const rules = [
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key material"],
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, "AWS access key"],
    [/\bgh[oprsu]_[A-Za-z0-9]{30,}\b/, "GitHub token"],
    [/\bsk-[A-Za-z0-9_-]{24,}\b/, "secret token"],
    [/\.ROBLOSECURITY\s*=\s*[A-Za-z0-9_\-.]{20,}/i, "Roblox session cookie"],
    [/(?:api[_-]?key|token|secret)\s*[:=]\s*["'][A-Za-z0-9_\-.]{24,}["']/i, "hard-coded credential"],
    [/https?:\/\/[^\s/@:]+:[^\s/@]+@/i, "credential embedded in URL", true],
  ];
  for (const [pattern, label, allowTestFixture = false] of rules) {
    if (pattern.test(text) && !(allowTestFixture && isTestFixture)) findings.push(`${portable(path)}: ${label}`);
  }
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    const path = portable(absolute);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) await walk(absolute);
    else if (stats.isFile()) {
      if (sensitiveFile.test(path)) findings.push(`${path}: sensitive filename`);
      if (stats.size <= 2 * 1024 * 1024 && textExtensions.has(extname(path).toLocaleLowerCase())) {
        inspectText(absolute, await readFile(absolute, "utf8"));
      }
    }
  }
}

await walk(projectRoot);
if (findings.length) throw new Error(`Secret check failed:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
process.stdout.write("Secret check passed: no credential-bearing files or token patterns found.\n");
