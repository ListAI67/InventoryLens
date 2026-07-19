import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";
import { sha256, validateReleaseTree } from "./release-utils.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const dist = resolve(projectRoot, "dist");
const releaseDirectory = resolve(projectRoot, "release");
const unpackedDirectory = resolve(releaseDirectory, "inventory-lens-unpacked");
const extensionZip = resolve(releaseDirectory, "inventory-lens.zip");
const sourceZip = resolve(releaseDirectory, "inventory-lens-source.zip");
const { files: runtimeFiles } = await validateReleaseTree(dist, packageJson.version);

function assertInside(parent, target) {
  const path = relative(parent, target);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || resolve(parent, path) !== target) {
    throw new Error(`Refusing to modify a path outside ${parent}: ${target}`);
  }
}

for (const target of [unpackedDirectory, extensionZip, sourceZip]) {
  assertInside(releaseDirectory, target);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current >>> 1) ^ (current & 1 ? 0xEDB88320 : 0);
  return current >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zipDateTime() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  const date = Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1_000) : new Date(Date.UTC(2020, 0, 1));
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

async function createDeterministicZip(files) {
  if (files.length > 0xFFFF) throw new Error("ZIP64 is not supported; source tree contains too many files.");
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const { time, day } = zipDateTime();

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const name = Buffer.from(file.path, "utf8");
    const data = await readFile(file.absolute);
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    if (data.length > 0xFFFFFFFF || compressed.length > 0xFFFFFFFF || localOffset > 0xFFFFFFFF) {
      throw new Error(`ZIP64 is not supported; file is too large: ${file.path}`);
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

const excludedSourceDirectories = new Set([
  ".git",
  ".idea",
  ".vscode",
  ".chrome-profile",
  ".brave-profile",
  ".edge-profile",
  ".firefox-profile",
  ".secrets",
  "cache",
  "coverage",
  "dist",
  "dist-web",
  "local-test",
  "node_modules",
  "playwright-report",
  "release",
  "secrets",
  "test-results",
  "tmp",
  "web-ext-artifacts",
  "work",
  ".vercel",
]);
const excludedSourceExtensions = new Set([".crx", ".key", ".log", ".p12", ".pem", ".pfx", ".tsbuildinfo", ".xpi", ".zip"]);

async function collectSourceFiles() {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedSourceDirectories.has(entry.name)) continue;
      if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;
      const absolute = resolve(directory, entry.name);
      const stats = await lstat(absolute);
      const path = relative(projectRoot, absolute).split(sep).join("/");
      if (stats.isSymbolicLink()) throw new Error(`Source tree contains a symbolic link: ${path}`);
      if (stats.isDirectory()) await walk(absolute);
      else if (stats.isFile() && !excludedSourceExtensions.has(extname(entry.name).toLocaleLowerCase())) {
        files.push({ absolute, path, size: stats.size });
      }
    }
  }
  await walk(projectRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

await mkdir(releaseDirectory, { recursive: true });
await rm(unpackedDirectory, { recursive: true, force: true });
await mkdir(unpackedDirectory, { recursive: true });
for (const file of runtimeFiles) {
  const destination = resolve(unpackedDirectory, ...file.path.split("/"));
  assertInside(unpackedDirectory, destination);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(file.absolute, destination);
}

const sourceFiles = await collectSourceFiles();
for (const required of [
  "LICENSE",
  "README.md",
  "INSTALL.md",
  "PRIVACY.md",
  "SECURITY.md",
  "VERCEL_DEPLOY.md",
  "api/proxy.ts",
  "server/proxy-policy.ts",
  "vercel.json",
  "vite.web.config.ts",
  "package.json",
  "pnpm-lock.yaml",
]) {
  if (!sourceFiles.some((file) => file.path === required)) throw new Error(`Required source file is missing: ${required}`);
}

const extensionArchive = await createDeterministicZip(runtimeFiles);
const sourceArchive = await createDeterministicZip(sourceFiles);
await writeFile(extensionZip, extensionArchive, { flag: "w" });
await writeFile(sourceZip, sourceArchive, { flag: "w" });

process.stdout.write([
  `Created ${unpackedDirectory}`,
  `Created ${extensionZip}`,
  `SHA-256 ${sha256(extensionArchive)}`,
  `Created ${sourceZip}`,
  `SHA-256 ${sha256(sourceArchive)}`,
  "",
].join("\n"));
