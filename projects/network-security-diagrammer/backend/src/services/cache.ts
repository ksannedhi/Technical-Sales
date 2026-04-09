import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cacheDir = path.resolve(process.cwd(), "cache");

function getCachePath(key: string) {
  return path.join(cacheDir, `${key}.json`);
}

export function createCacheKey(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await readFile(getCachePath(key), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(getCachePath(key), JSON.stringify(value, null, 2), "utf8");
}
