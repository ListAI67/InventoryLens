export interface ReleaseFile {
  absolute: string;
  path: string;
  size: number;
}

export function collectRegularFiles(root: string): Promise<ReleaseFile[]>;
export function validatePackagedText(path: string, text: string): void;
export function validateManifestSecurity(manifest: unknown): void;
export function validateReleaseTree(
  root: string,
  expectedVersion: string,
): Promise<{ files: ReleaseFile[]; totalSize: number; manifest: Record<string, unknown> }>;
export function sha256(buffer: string | Uint8Array): string;
