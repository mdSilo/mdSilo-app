import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import UpdatePrompt from "./UpdatePrompt";
import { checkForUpdate, useUpdater, type UpdateInfo } from "./updater";

type Handler = (e: { payload: unknown }) => void;
const listeners = vi.hoisted(() => new Map<string, Handler>());
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, handler: Handler) => {
    listeners.set(event, handler);
    return () => listeners.delete(event);
  }),
}));

const UPDATE: UpdateInfo = {
  version: "0.9.0",
  currentVersion: "0.8.1",
  date: "2026-11-20T00:00:00+00:00",
  notes: "",
  canInstall: true,
};

beforeEach(() => {
  listeners.clear();
  useUpdater.setState({
    status: "idle",
    update: null,
    percent: null,
    error: null,
    dismissed: false,
  });
  store.setState({ checkForUpdates: true });
});

describe("the self updater", () => {
  test("checks on startup, offers the update, installs it with progress", async () => {
    vi.useFakeTimers();
    let finish: (v?: unknown) => void = () => {};
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "update_check") return UPDATE;
      if (cmd === "update_install") return new Promise((r) => (finish = r));
      return undefined;
    });
    render(<UpdatePrompt />);
    expect(invoke).not.toHaveBeenCalledWith("update_check");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    vi.useRealTimers();
    expect(invoke).toHaveBeenCalledWith("update_check");
    expect(
      await screen.findByText("mdSilo 0.9.0 is available."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("Update and Restart"));
    expect(invoke).toHaveBeenCalledWith("update_install");
    act(() =>
      listeners.get("update-progress")?.({
        payload: { downloaded: 42, total: 100 },
      }),
    );
    expect(
      await screen.findByText("Updating mdSilo to 0.9.0… 42%"),
    ).toBeInTheDocument();
    // no closing it while installing
    expect(screen.queryByLabelText("Later")).toBeNull();
    finish();
  });

  test("does not check on startup when turned off", async () => {
    vi.useFakeTimers();
    store.setState({ checkForUpdates: false });
    render(<UpdatePrompt />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    vi.useRealTimers();
    expect(invoke).not.toHaveBeenCalledWith("update_check");
  });

  test("a build that cannot replace itself links to the release", async () => {
    store.setState({ checkForUpdates: false });
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === "update_check" ? { ...UPDATE, canInstall: false } : undefined,
    );
    render(<UpdatePrompt />);
    await act(async () => {
      await checkForUpdate();
    });
    expect(screen.queryByText("Update and Restart")).toBeNull();
    await userEvent.click(screen.getByText("Download"));
    expect(invoke).toHaveBeenCalledWith("open_url", {
      url: "https://github.com/mdSilo/mdSilo-app/releases/tag/mdsilo-v0.9.0",
    });
  });

  test("says when the install fails, and can be closed", async () => {
    store.setState({ checkForUpdates: false });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "update_check") return UPDATE;
      if (cmd === "update_install") throw "signature mismatch";
      return undefined;
    });
    render(<UpdatePrompt />);
    await act(async () => {
      await checkForUpdate();
    });
    await userEvent.click(screen.getByText("Update and Restart"));
    expect(
      await screen.findByText("Could not update to 0.9.0."),
    ).toBeInTheDocument();
    expect(useUpdater.getState().error).toBe("signature mismatch");
    await userEvent.click(screen.getByLabelText("Later"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("a failed check says nothing in the prompt", async () => {
    store.setState({ checkForUpdates: false });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "update_check") throw "offline";
      return undefined;
    });
    render(<UpdatePrompt />);
    await act(async () => {
      await checkForUpdate();
    });
    expect(useUpdater.getState().status).toBe("error");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
