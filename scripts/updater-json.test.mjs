import { platformsOf } from "./updater-json.mjs";

const url = (name) => `https://dl/${name}`;
const sign = (...names) =>
  names.map((name) => ({ name, signature: `sig:${name}` }));

describe("platformsOf", () => {
  it("names each asset by os, arch and installer", () => {
    const platforms = platformsOf(
      sign(
        "mdsilo_0.8.1_amd64.AppImage",
        "mdsilo_0.8.1_amd64.deb",
        "mdsilo-0.8.1-1.x86_64.rpm",
        "mdsilo_0.8.1_aarch64.AppImage",
        "mdsilo_0.8.1_arm64.deb",
        "mdsilo-0.8.1-1.aarch64.rpm",
        "mdsilo_0.8.1_x64-setup.exe",
        "mdsilo_0.8.1_x64_en-US.msi",
        "mdsilo_0.8.1_arm64-setup.exe",
        "mdsilo_0.8.1_aarch64.app.tar.gz",
        "mdsilo_0.8.1_x64.app.tar.gz",
      ),
      url,
    );
    expect(platforms["linux-x86_64-deb"].url).toBe(
      "https://dl/mdsilo_0.8.1_amd64.deb",
    );
    expect(platforms["linux-aarch64-rpm"].signature).toBe(
      "sig:mdsilo-0.8.1-1.aarch64.rpm",
    );
    expect(platforms["windows-x86_64-msi"].url).toBe(
      "https://dl/mdsilo_0.8.1_x64_en-US.msi",
    );
    expect(platforms["windows-aarch64-nsis"].url).toBe(
      "https://dl/mdsilo_0.8.1_arm64-setup.exe",
    );
    expect(platforms["darwin-x86_64-app"].url).toBe(
      "https://dl/mdsilo_0.8.1_x64.app.tar.gz",
    );
    // the plain keys: AppImage on Linux, NSIS on Windows
    expect(platforms["linux-x86_64"].url).toBe(
      "https://dl/mdsilo_0.8.1_amd64.AppImage",
    );
    expect(platforms["linux-aarch64"].url).toBe(
      "https://dl/mdsilo_0.8.1_aarch64.AppImage",
    );
    expect(platforms["windows-x86_64"].url).toBe(
      "https://dl/mdsilo_0.8.1_x64-setup.exe",
    );
    expect(platforms["darwin-aarch64"].url).toBe(
      "https://dl/mdsilo_0.8.1_aarch64.app.tar.gz",
    );
  });

  it("gives the universal macOS build to an arch without its own", () => {
    const platforms = platformsOf(
      sign(
        "mdsilo_0.8.1_aarch64.app.tar.gz",
        "mdsilo_0.8.1_universal.app.tar.gz",
      ),
      url,
    );
    expect(platforms["darwin-aarch64-app"].url).toBe(
      "https://dl/mdsilo_0.8.1_aarch64.app.tar.gz",
    );
    expect(platforms["darwin-x86_64-app"].url).toBe(
      "https://dl/mdsilo_0.8.1_universal.app.tar.gz",
    );
    expect(platforms["darwin-x86_64"].url).toBe(
      "https://dl/mdsilo_0.8.1_universal.app.tar.gz",
    );
    expect(platforms["darwin-universal-app"]).toBeDefined();
  });

  it("skips what the updater cannot install", () => {
    const platforms = platformsOf(
      sign("mdsilo_0.8.1_aarch64.dmg", "latest.json"),
      url,
    );
    expect(platforms).toEqual({});
  });
});
