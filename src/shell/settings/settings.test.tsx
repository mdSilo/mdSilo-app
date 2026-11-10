import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import { useLanguage } from "@/i18n/useLanguage";
import { setLanguage } from "@/i18n";
import SettingsModal from "./SettingsModal";
import ThemeEditorModal from "./ThemeEditorModal";
import FontsModal from "./FontsModal";
import EditorSettings from "./EditorSettings";
import AboutModal from "./AboutModal";

describe("BaseModal", () => {
  test("renders title and children when open", async () => {
    render(
      <BaseModal title="Hello" isOpen handleClose={vi.fn()}>
        <p>body</p>
      </BaseModal>,
    );
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  test("closes on a click outside the panel", async () => {
    const handleClose = vi.fn();
    render(
      <BaseModal title="Hello" isOpen handleClose={handleClose}>
        <p>body</p>
      </BaseModal>,
    );
    await screen.findByText("Hello");
    fireEvent.click(document.querySelector(".bg-gray-500\\/75") as HTMLElement);
    expect(handleClose).toHaveBeenCalled();
    handleClose.mockClear();
    fireEvent.click(screen.getByText("body"));
    expect(handleClose).not.toHaveBeenCalled();
  });

  test("renders nothing when closed", () => {
    render(
      <BaseModal title="Hello" isOpen={false} handleClose={vi.fn()}>
        <p>body</p>
      </BaseModal>,
    );
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  test("closes with the X icon", async () => {
    const handleClose = vi.fn();
    render(
      <BaseModal title="Hello" isOpen handleClose={handleClose}>
        <p>body</p>
      </BaseModal>,
    );
    const title = await screen.findByText("Hello");
    const closeIcon = title
      .closest(".inline-block")
      ?.querySelector("svg") as SVGElement;
    fireEvent.click(closeIcon);
    expect(handleClose).toHaveBeenCalled();
  });
});

describe("SettingsModal", () => {
  test("updates the global settings", async () => {
    render(<SettingsModal isOpen handleClose={vi.fn()} />);
    await screen.findByText("Settings");

    const themeSelect = screen.getByLabelText("Theme");
    expect(themeSelect).toHaveValue("system");
    fireEvent.change(themeSelect, { target: { value: "dracula" } });
    expect(store.getState().theme).toBe("dracula");

    fireEvent.change(screen.getByLabelText("Side Menu Orientation"), {
      target: { value: "horizontal" },
    });
    expect(store.getState().sideMenuOrientation).toBe("horizontal");

    const openOn = screen.getByLabelText("Open on Startup");
    expect(openOn).toHaveValue("previous");
    fireEvent.change(openOn, { target: { value: "pinned" } });
    expect(store.getState().openOnStartup).toBe("pinned");

    const startupView = screen.getByLabelText("View on Startup");
    expect(startupView).toHaveValue("notes");
    fireEvent.change(startupView, { target: { value: "library" } });
    expect(store.getState().startupView).toBe("library");
  });

  test("sets the language of the UI", async () => {
    // as in App: the language of the settings applied
    const WithLanguage = () => {
      useLanguage();
      return <SettingsModal isOpen handleClose={vi.fn()} />;
    };
    render(<WithLanguage />);
    await screen.findByText("Settings");
    const language = screen.getByLabelText("Language");
    expect(language).toHaveValue("system");

    fireEvent.change(language, { target: { value: "zh-CN" } });
    expect(store.getState().language).toBe("zh-CN");
    expect(await screen.findByText("设置")).toBeInTheDocument();
    expect(screen.getByLabelText("语言")).toHaveValue("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");

    fireEvent.change(screen.getByLabelText("语言"), {
      target: { value: "es" },
    });
    expect(await screen.findByText("Ajustes")).toBeInTheDocument();

    store.setState({ language: "system" });
    await setLanguage("en");
  });

  test("has no editor settings", async () => {
    render(<SettingsModal isOpen handleClose={vi.fn()} />);
    await screen.findByText("Settings");
    expect(
      screen.queryByLabelText("Editor Font Family"),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });
});

describe("EditorSettings", () => {
  test("updates the editor settings", async () => {
    render(<EditorSettings />);

    fireEvent.change(screen.getByLabelText("Editor Font Family"), {
      target: { value: "Sniglet" },
    });
    expect(store.getState().font).toBe("Sniglet");

    // a step a click: 1.1 → 1.5, 1.6 → 2, 400 → 700
    for (let i = 0; i < 4; i++)
      fireEvent.click(screen.getByLabelText("Increase Font Size"));
    for (let i = 0; i < 4; i++)
      fireEvent.click(screen.getByLabelText("Increase Line Height"));
    for (let i = 0; i < 3; i++)
      fireEvent.click(screen.getByLabelText("Increase Font Weight"));
    expect(
      screen.getByRole("spinbutton", { name: "Font Size" }),
    ).toHaveAttribute("aria-valuetext", "1.5em");
    expect(store.getState().fontSize).toBe(1.5);
    expect(store.getState().lineHeight).toBe(2);
    expect(store.getState().fontWt).toBe(700);

    await userEvent.click(screen.getByLabelText("Right to Left"));
    expect(store.getState().isRTL).toBe(true);
    await userEvent.click(screen.getByLabelText("Spell Check"));
    expect(store.getState().isCheckSpellOn).toBe(false);
    await userEvent.click(screen.getByLabelText("Use Assets Folder"));
    expect(store.getState().useAsset).toBe(false);
  });

  test("the numbers within their bounds", () => {
    render(<EditorSettings />);
    const weight = screen.getByRole("spinbutton", { name: "Font Weight" });
    fireEvent.keyDown(weight, { key: "End" });
    expect(store.getState().fontWt).toBe(900);
    expect(screen.getByLabelText("Increase Font Weight")).toBeDisabled();
    fireEvent.keyDown(weight, { key: "PageDown" });
    expect(store.getState().fontWt).toBe(100);
    for (let i = 0; i < 30; i++)
      fireEvent.click(screen.getByLabelText("Decrease Font Size"));
    expect(store.getState().fontSize).toBe(0.8);
  });
});

describe("AboutModal", () => {
  test("shows versions and handles actions", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === "get_log" ? [{ ty: "x" }] : undefined,
    );

    render(<AboutModal isOpen handleClose={vi.fn()} />);
    expect(
      await screen.findByText("App Version: 0.0.0-test"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Tauri Version: 2.0.0-test"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("Clear Log"));
    expect(invoke).toHaveBeenCalledWith("del_log");

    await userEvent.click(screen.getByText("Copy About"));
    expect(writeText).toHaveBeenCalledWith(
      "App: 0.0.0-test \n Tauri: 2.0.0-test",
    );

    await userEvent.click(screen.getByText("Copy Log"));
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith('[{"ty":"x"}]'),
    );

    await userEvent.click(screen.getByText("Check for Updates"));
    expect(invoke).toHaveBeenCalledWith("open_url", {
      url: "https://github.com/mdSilo/mdSilo-app/releases",
    });
  });
});

describe("custom themes", () => {
  test("the theme editor and the fonts have dialogs of their own, opened from the settings", async () => {
    store.setState({
      themeEditing: null,
      isFontsOpen: false,
      customThemes: [],
      workspaceThemes: [],
      theme: "system",
    });
    const user = userEvent.setup();
    const close = vi.fn();
    render(<SettingsModal isOpen handleClose={close} />);
    // the theme is chosen in the settings; New Theme opens its editor at once
    expect(screen.getByLabelText("Theme")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Theme" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "New Theme" }));
    expect(close).toHaveBeenCalled();
    expect(store.getState().themeEditing).toBe("new");
    await user.click(screen.getByRole("button", { name: "Manage Fonts" }));
    expect(store.getState().isFontsOpen).toBe(true);
    store.setState({ themeEditing: null, isFontsOpen: false });
  });

  test("the fonts dialog scrolls inside, under its title", async () => {
    store.setState({ isFontsOpen: true });
    render(<FontsModal />);
    const fonts = await screen.findByTestId("fonts-setting");
    expect(fonts.closest(".overflow-y-auto")).toHaveClass(
      "max-h-[calc(100vh-8rem)]",
    );
    store.setState({ isFontsOpen: false });
  });

  test("makes a theme on this device and applies it", async () => {
    store.setState({
      customThemes: [],
      workspaceThemes: [],
      initDir: undefined,
      theme: "system",
      themeEditing: "new",
    });
    const user = userEvent.setup();
    render(
      <>
        <SettingsModal isOpen handleClose={vi.fn()} />
        <ThemeEditorModal />
      </>,
    );
    const name = screen.getByLabelText("Theme Name");
    await user.clear(name);
    await user.type(name, "Ocean");
    expect(screen.getByLabelText("Theme Preview").dataset.theme).toBe(
      "user-draft",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    const [saved] = store.getState().customThemes;
    expect(saved).toMatchObject({ name: "Ocean", where: "device" });
    expect(store.getState().theme).toBe(`user-${saved.id}`);
    expect(screen.getByRole("option", { name: "Ocean" })).toBeInTheDocument();
    // edit, then delete it
    await user.click(screen.getByRole("button", { name: "Edit Theme" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(store.getState().customThemes).toEqual([]));
    expect(store.getState().theme).toBe("system");
  });

  test("warns of content hard to read, and sets radius and border", async () => {
    store.setState({
      customThemes: [],
      workspaceThemes: [],
      initDir: undefined,
      theme: "system",
      themeEditing: "new",
    });
    const user = userEvent.setup();
    render(<ThemeEditorModal />);
    fireEvent.change(screen.getByLabelText("primary"), {
      target: { value: "#ffff00" },
    });
    fireEvent.change(screen.getByLabelText("primary-content"), {
      target: { value: "#ffffff" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "primary-content on primary",
    );
    fireEvent.change(screen.getByLabelText("primary-content"), {
      target: { value: "#000000" },
    });
    expect(screen.queryByText(/primary-content on primary/)).toBeNull();

    // stepped to a value: up or down, a step a click
    const stepTo = (name: string, target: number) => {
      const now = () =>
        Number(
          screen
            .getByRole("spinbutton", { name })
            .getAttribute("aria-valuenow"),
        );
      for (let i = 0; i < 50 && now() !== target; i++)
        fireEvent.click(
          screen.getByLabelText(
            `${now() < target ? "Increase" : "Decrease"} ${name}`,
          ),
        );
      expect(now()).toBe(target);
    };
    stepTo("Box Radius", 1.5);
    stepTo("Border", 2);
    expect(screen.getByText("1.5rem")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(store.getState().customThemes[0].vars).toMatchObject({
      "--radius-box": "1.5rem",
      "--border": "2px",
    });
  });
});
