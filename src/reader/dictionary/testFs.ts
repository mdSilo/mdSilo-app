import { readFileSync } from "node:fs";
import { invoke } from "@tauri-apps/api/core";
import { vi } from "vitest";

/**
 * For tests: the commands of files the dictionaries use, on files in memory
 * (text or bytes); the fixtures read from src/reader/dictionary/fixtures.
 */
export type MemoryFs = Map<string, string | Uint8Array>;

export const fixture = (name: string) =>
  new Uint8Array(readFileSync(`src/reader/dictionary/fixtures/${name}`));

export const fixtureFile = (name: string) => new File([fixture(name)], name);

const bytesOf = (data: string | Uint8Array) =>
  typeof data === "string" ? new TextEncoder().encode(data) : data;

export function mockFs(
  files: MemoryFs = new Map(),
  /** the files on the device, to copy in by path (desktop) */
  outside: Record<string, Uint8Array> = {},
) {
  vi.mocked(invoke).mockImplementation(async (cmd, raw) => {
    const args = (raw ?? {}) as Record<string, unknown>;
    const path = String(args.filePath ?? args.path ?? "");
    switch (cmd) {
      case "read_file": {
        const data = files.get(path);
        if (data === undefined) throw new Error(`no ${path}`);
        return typeof data === "string" ? data : new TextDecoder().decode(data);
      }
      case "write_file":
        files.set(path, String(args.text));
        return true;
      case "file_exist":
        return files.has(path);
      case "create_dir_recursive":
        return true;
      case "write_file_blob": {
        const blob = args.blob as Blob;
        files.set(path, new Uint8Array(await blob.arrayBuffer()));
        return true;
      }
      case "copy_file": {
        const data = outside[String(args.srcPath)];
        if (!data) return false;
        files.set(String(args.toPath), data);
        return true;
      }
      case "get_file_meta": {
        const data = files.get(path) ?? outside[path];
        if (data === undefined) throw new Error(`no ${path}`);
        return { size: bytesOf(data).length };
      }
      case "read_file_range": {
        const data = files.get(path);
        if (data === undefined) throw new Error(`no ${path}`);
        const start = Number(args.start);
        return bytesOf(data).slice(start, start + Number(args.len)).buffer;
      }
      case "delete_files":
        for (const p of args.paths as string[])
          for (const key of [...files.keys()])
            if (key === p || key.startsWith(`${p}/`)) files.delete(key);
        return true;
      default:
        return undefined;
    }
  });
  return files;
}
