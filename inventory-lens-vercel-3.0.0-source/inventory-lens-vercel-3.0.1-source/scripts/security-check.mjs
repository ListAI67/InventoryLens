import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateReleaseTree } from "./release-utils.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const result = await validateReleaseTree(resolve(projectRoot, "dist"), packageJson.version);
process.stdout.write(
  `Security check passed: ${result.files.length} packaged files, ${(result.totalSize / 1024).toFixed(1)} KiB, Manifest V3 ${packageJson.version}.\n`,
);
