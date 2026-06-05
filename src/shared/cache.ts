import { existsSync, readFileSync, writeFileSync } from "fs";

export function loadCache<T>(file: string, fallback: T): T {
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      // Corrupt cache — start fresh
    }
  }
  return fallback;
}

export function saveCache<T>(file: string, data: T): void {
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
