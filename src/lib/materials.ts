export const MATERIAL_BUCKET = "session-materials";
export const MAX_MATERIAL_FILE_BYTES = 50 * 1024 * 1024;

/** Keep the storage key safe and bounded. */
export function sanitizeMaterialFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  return cleaned || "file";
}
