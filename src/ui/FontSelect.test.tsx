import { invoke } from "@tauri-apps/api/core";
import { render, screen, within } from "@testing-library/react";
import { mockInvoke } from "@/testUtils";
import FontsSetting from "@/shell/settings/FontsSetting";
import FontSelect from "./FontSelect";

vi.mock("@/workspace/util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/workspace/util")>()),
  isTauri: true,
}));

beforeEach(() => {
  mockInvoke(invoke, { system_fonts: ["Noto Serif", "Ubuntu"] });
});

const props = {
  label: "Font",
  defaultOption: ["", "Default"] as [string, string],
  onChange: () => undefined,
};

it("lists the fonts of the system, listed once", async () => {
  const { unmount } = render(<FontSelect {...props} value="" />);
  const group = await screen.findByRole("group", { name: "System" });
  expect(
    within(group)
      .getAllByRole("option")
      .map((o) => [o.textContent, (o as HTMLOptionElement).value]),
  ).toEqual([
    ["Noto Serif", "system:Noto Serif"],
    ["Ubuntu", "system:Ubuntu"],
  ]);
  unmount();
  render(<FontSelect {...props} value="system:Ubuntu" />);
  await screen.findByRole("group", { name: "System" });
  expect(screen.getByRole("combobox")).toHaveValue("system:Ubuntu");
  expect(
    vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "system_fonts"),
  ).toHaveLength(1);
});

it("keeps a system font chosen that is not installed any more", async () => {
  render(<FontSelect {...props} value="system:Gone Sans" />);
  const group = await screen.findByRole("group", { name: "System" });
  expect(
    within(group).getByRole("option", { name: "Gone Sans" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toHaveValue("system:Gone Sans");
});

it("suggests the fonts of the system to add by name", async () => {
  render(<FontsSetting />);
  const input = screen.getByLabelText("System Font Name");
  await vi.waitFor(() => expect(input).toHaveAttribute("list", "system-fonts"));
  const list = document.getElementById("system-fonts")!;
  expect([...list.querySelectorAll("option")].map((o) => o.value)).toEqual([
    "Noto Serif",
    "Ubuntu",
  ]);
});
