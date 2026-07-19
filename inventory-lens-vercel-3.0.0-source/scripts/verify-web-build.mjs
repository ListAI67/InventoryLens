import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(projectRoot, "dist-web");
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const stats = await lstat(absolute);
    const path = relative(webRoot, absolute).split(sep).join("/");
    if (stats.isSymbolicLink()) throw new Error(`Web build contains a symbolic link: ${path}`);
    if (stats.isDirectory()) await walk(absolute);
    else if (stats.isFile()) files.push({ absolute, path, size: stats.size });
  }
}

await walk(webRoot);
const paths = new Set(files.map(({ path }) => path));
if (!paths.has("index.html")) throw new Error("Web build is missing index.html.");

const forbiddenNames = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
];
for (const name of forbiddenNames) {
  if (paths.has(name)) throw new Error(`Extension-only file leaked into web build: ${name}`);
}
for (const file of files) {
  const extension = extname(file.path).toLocaleLowerCase();
  if ([".map", ".ts", ".tsx"].includes(extension) || /(?:^|\/)\.env(?:\.|$)/i.test(file.path)) {
    throw new Error(`Source or environment file leaked into web build: ${file.path}`);
  }
  if (file.size > 20 * 1024 * 1024) throw new Error(`Unexpectedly large web asset: ${file.path}`);
}

const html = await readFile(resolve(webRoot, "index.html"), "utf8");
if (/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(html)) {
  throw new Error("Web build contains a remote executable script.");
}
const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
  .map((match) => match[1]);
if (!scriptSources.length || scriptSources.some((source) => !source.startsWith("/assets/"))) {
  throw new Error("Web build scripts must be local hashed assets.");
}

const javaScript = (await Promise.all(files
  .filter(({ path }) => extname(path).toLocaleLowerCase() === ".js")
  .map(({ absolute }) => readFile(absolute, "utf8"))))
  .join("\n");
if (!javaScript.includes("/api/proxy?url=")) {
  throw new Error("Web build does not contain the same-origin proxy transport.");
}
if (/\bchrome\.(?:runtime|tabs|storage)\b/.test(javaScript)) {
  throw new Error("Extension-only Chrome APIs leaked into the web entry bundle.");
}

process.stdout.write(`Verified Vercel web build: ${files.length} local files, no extension runtime or remote code.\n`);
