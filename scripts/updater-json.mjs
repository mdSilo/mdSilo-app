#!/usr/bin/env node
// The update manifest (latest.json) of a release, for the self updater (see
// src-tauri/src/updater.rs): the app asks
//   https://github.com/<repo>/releases/latest/download/latest.json
// and gets the one of the latest published release.
//
//   node scripts/updater-json.mjs <dir of the .sig files> <repo> <tag> <version> [notes] > latest.json
//
// Made once, after all the builds of release.yml (each build adding itself to
// the file, as tauri-action does, loses entries when builds end together).
// The keys are those of tauri-plugin-updater: `{os}-{arch}-{installer}`, which
// it looks up first, and `{os}-{arch}` for the rest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** [pattern on the asset's name, os, arch, installer] */
const ASSETS = [
  [/_(amd64)\.AppImage$/, "linux", "x86_64", "appimage"],
  [/_(aarch64)\.AppImage$/, "linux", "aarch64", "appimage"],
  [/_(amd64)\.deb$/, "linux", "x86_64", "deb"],
  [/_(arm64)\.deb$/, "linux", "aarch64", "deb"],
  [/\.(x86_64)\.rpm$/, "linux", "x86_64", "rpm"],
  [/\.(aarch64)\.rpm$/, "linux", "aarch64", "rpm"],
  [/_(x64)-setup\.exe$/, "windows", "x86_64", "nsis"],
  [/_(arm64)-setup\.exe$/, "windows", "aarch64", "nsis"],
  [/_(x64)_[^_]+\.msi$/, "windows", "x86_64", "msi"],
  [/_(arm64)_[^_]+\.msi$/, "windows", "aarch64", "msi"],
  [/_(x64|x86_64)\.app\.tar\.gz$/, "darwin", "x86_64", "app"],
  [/_(aarch64)\.app\.tar\.gz$/, "darwin", "aarch64", "app"],
  [/_(universal)\.app\.tar\.gz$/, "darwin", "universal", "app"],
];

/** which installer answers the plain `{os}-{arch}` key, first found wins */
const PLAIN = ["appimage", "nsis", "app", "msi", "deb", "rpm"];

/**
 * The platforms of the manifest, from the signed assets of the release.
 * @param {{name: string, signature: string}[]} signed the asset (not its .sig) and its signature
 * @param {(name: string) => string} urlOf where the asset is downloaded
 */
export function platformsOf(signed, urlOf) {
  /** @type {Record<string, {signature: string, url: string}>} */
  const platforms = {};
  /** @type {Record<string, string>} plain key -> installer of it */
  const plainBy = {};
  const put = (os, arch, installer, entry) => {
    platforms[`${os}-${arch}-${installer}`] = entry;
    const plain = `${os}-${arch}`;
    const had = plainBy[plain];
    if (!had || PLAIN.indexOf(installer) < PLAIN.indexOf(had)) {
      platforms[plain] = entry;
      plainBy[plain] = installer;
    }
  };

  const universal = [];
  for (const { name, signature } of signed) {
    const found = ASSETS.find(([pattern]) => pattern.test(name));
    if (!found) continue;
    const [, os, arch, installer] = found;
    const entry = { signature, url: urlOf(name) };
    put(os, arch, installer, entry);
    if (arch === "universal") universal.push(entry);
  }
  // a universal macOS build runs on both: for the arch without a build of its own
  for (const entry of universal) {
    for (const arch of ["x86_64", "aarch64"]) {
      if (!platforms[`darwin-${arch}-app`]) put("darwin", arch, "app", entry);
    }
  }
  return Object.fromEntries(
    Object.entries(platforms).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function main([dir, repo, tag, version, notes = ""]) {
  if (!dir || !repo || !tag || !version) {
    console.error(
      "usage: updater-json.mjs <dir of .sig files> <repo> <tag> <version> [notes]",
    );
    process.exit(2);
  }
  const signed = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sig"))
    .map((file) => ({
      name: file.slice(0, -".sig".length),
      signature: fs.readFileSync(path.join(dir, file), "utf8").trim(),
    }));
  const platforms = platformsOf(
    signed,
    (name) =>
      `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
  );
  if (Object.keys(platforms).length === 0) {
    console.error(`no signed assets in ${dir}`);
    process.exit(1);
  }
  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
