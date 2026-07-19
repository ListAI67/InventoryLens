import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { validateManifestSecurity, validatePackagedText } from "./release-utils.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceRoots = [
  resolve(projectRoot, "api"),
  resolve(projectRoot, "server"),
  resolve(projectRoot, "src"),
  resolve(projectRoot, "public"),
];
const individualFiles = [
  resolve(projectRoot, "index.html"),
  resolve(projectRoot, "popup.html"),
  resolve(projectRoot, "vercel.json"),
  resolve(projectRoot, "vite.web.config.ts"),
];
const checkedExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".ts", ".tsx", ".xml"]);
const findings = [];

function portable(path) {
  return relative(projectRoot, path).split(sep).join("/");
}

async function checkFile(path) {
  if (!checkedExtensions.has(extname(path).toLocaleLowerCase())) return;
  const name = portable(path);
  const text = await readFile(path, "utf8");
  try {
    validatePackagedText(name, text);
  } catch (error) {
    findings.push(error instanceof Error ? error.message : `${name}: invalid packaged URL policy`);
  }

  const rules = [
    [/\bdangerouslySetInnerHTML\b/, "dangerouslySetInnerHTML"],
    [/\binnerHTML\s*=/, "direct innerHTML assignment"],
    [/\bdocument\.write\s*\(/, "document.write"],
    [/\bdebugger\s*;/, "debugger statement"],
    [/@ts-(?:ignore|nocheck)\b/, "TypeScript checking suppression"],
    [/\bcredentials\s*:\s*["']include["']/, "credentialed cross-origin request"],
  ];
  for (const [pattern, label] of rules) {
    if (pattern.test(text)) findings.push(`${name}: disallowed ${label}`);
  }

  if (name !== "src/lib/endpoints.ts" && name !== "public/manifest.json") {
    const duplicatedApiOrigin = /https:\/\/(?:users|catalog|inventory|thumbnails)\.roblox\.com|https:\/\/roblox\.fandom\.com/;
    if (duplicatedApiOrigin.test(text)) findings.push(`${name}: API origin must be centralized in src/lib/endpoints.ts`);
  }
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) {
      findings.push(`${portable(absolute)}: source symlink is not allowed`);
    } else if (stats.isDirectory()) {
      await walk(absolute);
    } else if (stats.isFile()) {
      await checkFile(absolute);
    }
  }
}

for (const root of sourceRoots) await walk(root);
for (const file of individualFiles) await checkFile(file);

const manifest = JSON.parse(await readFile(resolve(projectRoot, "public/manifest.json"), "utf8"));
try {
  validateManifestSecurity(manifest);
} catch (error) {
  findings.push(error instanceof Error ? error.message : "public/manifest.json: invalid security policy");
}

if (findings.length) throw new Error(`Source policy lint failed:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
process.stdout.write("Source policy lint passed: URLs, DOM sinks, credentials, and manifest boundaries are clean.\n");
