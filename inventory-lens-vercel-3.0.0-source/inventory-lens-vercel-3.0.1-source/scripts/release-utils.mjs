import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);
const FORBIDDEN_RELEASE_EXTENSIONS = new Set([".map", ".ts", ".tsx", ".pem", ".key", ".p12", ".pfx"]);
const FORBIDDEN_RELEASE_NAMES = [
  /^\.env(?:\.|$)/i,
  /(?:^|\/)package(?:-lock)?\.json$/i,
  /(?:^|\/)pnpm-lock\.yaml$/i,
  /(?:^|\/)yarn\.lock$/i,
];
const REQUIRED_PERMISSIONS = Object.freeze(["activeTab", "storage"]);
const REQUIRED_HOST_PERMISSIONS = Object.freeze([
  "https://catalog.roblox.com/*",
  "https://inventory.roblox.com/*",
  "https://roblox.fandom.com/*",
  "https://thumbnails.roblox.com/*",
  "https://users.roblox.com/*",
]);
const REQUIRED_CONTENT_SCRIPT_MATCHES = Object.freeze([
  "https://roblox.com/users/*/profile*",
  "https://www.roblox.com/users/*/profile*",
]);
const ALLOWED_PACKAGED_URL_HOSTS = new Set([
  "catalog.roblox.com",
  "inventory.roblox.com",
  "react.dev",
  "roblox.com",
  "roblox.fandom.com",
  "thumbnails.roblox.com",
  "users.roblox.com",
  "www.roblox.com",
  "www.w3.org",
]);
const TRACKER_HOST_SUFFIXES = Object.freeze([
  "amplitude.com",
  "clarity.ms",
  "fullstory.com",
  "google-analytics.com",
  "googletagmanager.com",
  "hotjar.com",
  "mixpanel.com",
  "plausible.io",
  "posthog.com",
  "segment.io",
  "sentry.io",
]);

function portablePath(root, file) {
  return relative(root, file).split(sep).join("/");
}

export async function collectRegularFiles(root) {
  const absoluteRoot = resolve(root);
  const files = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) throw new Error(`Release tree contains a symbolic link: ${portablePath(absoluteRoot, absolute)}`);
      if (stats.isDirectory()) await walk(absolute);
      else if (stats.isFile()) files.push({ absolute, path: portablePath(absoluteRoot, absolute), size: stats.size });
    }
  }

  await walk(absoluteRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function exactStringSet(value, expected, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Manifest ${label} must be an exact string array.`);
  }
  const actual = [...new Set(value)].sort();
  const wanted = [...expected].sort();
  if (actual.length !== value.length || actual.length !== wanted.length || actual.some((item, index) => item !== wanted[index])) {
    throw new Error(`Manifest ${label} must contain only: ${wanted.join(", ")}.`);
  }
}

function isTrackerHost(hostname) {
  return TRACKER_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

export function validatePackagedText(path, text) {
  const checks = [
    [/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i, "remote executable script"],
    [/\b(?:eval|new\s+Function)\s*\(/, "dynamic code execution"],
    [/\.ROBLOSECURITY/i, "Roblox session cookie marker"],
    [/\bx-api-key\b/i, "API-key header"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
    [/\bapis\.roblox\.com\b/i, "legacy Open Cloud origin"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) throw new Error(`${path} contains forbidden ${label}.`);
  }

  const lowerText = text.toLocaleLowerCase();
  for (const suffix of TRACKER_HOST_SUFFIXES) {
    if (lowerText.includes(suffix)) throw new Error(`${path} contains disallowed analytics/tracker domain ${suffix}.`);
  }

  const urlOriginPattern = /\b(https?):\/\/(\*\.)?([a-z0-9.-]+)(?::(\d+))?/gi;
  for (let match = urlOriginPattern.exec(text); match; match = urlOriginPattern.exec(text)) {
    const protocol = match[1].toLocaleLowerCase();
    const wildcard = Boolean(match[2]);
    const hostname = match[3].toLocaleLowerCase().replace(/\.$/, "");
    const port = match[4];
    if (isTrackerHost(hostname)) throw new Error(`${path} contains disallowed analytics/tracker domain ${hostname}.`);
    if (protocol === "http" && hostname === "www.w3.org" && !wildcard && !port) continue;
    if (protocol !== "https" || (port && port !== "443")) {
      throw new Error(`${path} contains insecure or nonstandard external URL ${match[0]}.`);
    }
    const isRobloxCdn = hostname === "rbxcdn.com" || hostname.endsWith(".rbxcdn.com");
    if (wildcard && !isRobloxCdn) throw new Error(`${path} contains an unexpected wildcard URL host ${match[0]}.`);
    if (!ALLOWED_PACKAGED_URL_HOSTS.has(hostname) && !isRobloxCdn) {
      throw new Error(`${path} contains unexpected external/backend URL host ${hostname}.`);
    }
  }
}

export function validateManifestSecurity(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Release manifest must be an object.");
  }
  exactStringSet(manifest.permissions, REQUIRED_PERMISSIONS, "permissions");
  exactStringSet(manifest.host_permissions, REQUIRED_HOST_PERMISSIONS, "host_permissions");
  for (const field of ["optional_permissions", "optional_host_permissions"]) {
    if (manifest[field] !== undefined && (!Array.isArray(manifest[field]) || manifest[field].length > 0)) {
      throw new Error(`Manifest ${field} must be absent or empty.`);
    }
  }

  const serialized = JSON.stringify(manifest);
  if (serialized.includes("<all_urls>")) throw new Error("Manifest must not contain <all_urls>.");
  for (const field of ["externally_connectable", "oauth2", "key", "update_url"]) {
    if (manifest[field] !== undefined) throw new Error(`Manifest must not define ${field}.`);
  }

  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 1) {
    throw new Error("Manifest must define exactly one profile-page content script.");
  }
  const contentScript = manifest.content_scripts[0];
  exactStringSet(contentScript?.matches, REQUIRED_CONTENT_SCRIPT_MATCHES, "content_scripts matches");
  exactStringSet(contentScript?.js, ["content.js"], "content_scripts js");
  if (contentScript?.run_at !== "document_idle") throw new Error("Content script must run at document_idle.");

  const extensionCsp = manifest.content_security_policy?.extension_pages;
  if (typeof extensionCsp !== "string" || /'unsafe-(?:eval|inline)'/i.test(extensionCsp)) {
    throw new Error("Manifest extension CSP is missing or permits unsafe execution/wildcard origins.");
  }
  const csp = new Map(extensionCsp.split(";").map((directive) => {
    const [name = "", ...values] = directive.trim().split(/\s+/);
    return [name.toLocaleLowerCase(), values];
  }).filter(([name]) => name));
  const exactDirective = (name, values) => {
    const actual = csp.get(name);
    return Array.isArray(actual) && actual.length === values.length && actual.every((value, index) => value === values[index]);
  };
  if (
    !exactDirective("default-src", ["'self'"]) ||
    !exactDirective("script-src", ["'self'"]) ||
    !exactDirective("object-src", ["'none'"]) ||
    !exactDirective("base-uri", ["'none'"]) ||
    !exactDirective("frame-ancestors", ["'none'"])
  ) {
    throw new Error("Manifest extension CSP must keep local-only scripts and deny objects, bases, and frames.");
  }
}

export async function validateReleaseTree(root, expectedVersion) {
  const absoluteRoot = resolve(root);
  const files = await collectRegularFiles(absoluteRoot);
  if (!files.length) throw new Error(`Release tree is empty: ${absoluteRoot}`);
  if (!files.some((file) => file.path === "manifest.json")) throw new Error("manifest.json must be at the release root.");

  let totalSize = 0;
  for (const file of files) {
    totalSize += file.size;
    const extension = extname(file.path).toLocaleLowerCase();
    if (FORBIDDEN_RELEASE_EXTENSIONS.has(extension) || FORBIDDEN_RELEASE_NAMES.some((pattern) => pattern.test(file.path))) {
      throw new Error(`Forbidden release file: ${file.path}`);
    }
    if (file.size > 20 * 1024 * 1024) throw new Error(`Unexpectedly large release file: ${file.path}`);
    if (TEXT_EXTENSIONS.has(extension)) validatePackagedText(file.path, await readFile(file.absolute, "utf8"));
  }
  if (totalSize > 75 * 1024 * 1024) throw new Error("Release tree exceeds the 75 MiB safety limit.");

  const manifest = JSON.parse(await readFile(resolve(absoluteRoot, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) throw new Error("Release manifest must use Manifest V3.");
  validateManifestSecurity(manifest);
  if (manifest.version !== expectedVersion) {
    throw new Error(`Manifest version ${manifest.version ?? "<missing>"} does not match package version ${expectedVersion}.`);
  }
  if (!manifest.background?.service_worker || /^https?:/i.test(manifest.background.service_worker)) {
    throw new Error("Manifest background service worker must be a packaged local file.");
  }
  if (!files.some((file) => file.path === manifest.background.service_worker)) {
    throw new Error(`Missing background service worker: ${manifest.background.service_worker}`);
  }
  return { files, totalSize, manifest };
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}
