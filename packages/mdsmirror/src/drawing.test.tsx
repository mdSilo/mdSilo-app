import * as React from "react";
import { render, act, fireEvent, screen } from "@testing-library/react";
import { NodeSelection } from "prosemirror-state";
import MsEditor from "./index";

const setup = (
  props: Partial<React.ComponentProps<typeof MsEditor>>,
  value: string
) => {
  const ref = React.createRef<MsEditor>();
  render(<MsEditor ref={ref} value={value} {...props} />);
  return ref.current as MsEditor;
};

const selectImage = async (editor: MsEditor) => {
  const { view } = editor;
  await act(async () => {
    view.focus();
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, 1))
    );
  });
};

const button = (title: string) =>
  document.querySelector(`[title="${title}"] button`) as HTMLElement | null;

const isDrawing = (src: string) => src.includes("drawing/");

describe("the picture of a drawing", () => {
  test("edited from its toolbar, a drawing only", async () => {
    const onEditImage = vi.fn();
    const editor = setup(
      { isEditableImage: isDrawing, onEditImage },
      "![Plan](../drawing/Plan.svg)"
    );
    await selectImage(editor);
    await act(async () => {
      fireEvent.click(button("Edit drawing")!);
    });
    expect(onEditImage).toHaveBeenCalledWith("../drawing/Plan.svg");
  });

  test("no edit for another image", async () => {
    const editor = setup(
      { isEditableImage: isDrawing, onEditImage: vi.fn() },
      "![Pic](./assets/pic.png)"
    );
    await selectImage(editor);
    expect(button("Edit drawing")).toBeNull();
    expect(button("Delete image")).not.toBeNull();
  });

  test("edited by a double click", () => {
    const onEditImage = vi.fn();
    setup(
      { isEditableImage: isDrawing, onEditImage },
      "![Plan](../drawing/Plan.svg)"
    );
    const img = document.querySelector('img[alt="Plan"]') as HTMLElement;
    fireEvent.doubleClick(img.parentElement!);
    expect(onEditImage).toHaveBeenCalledWith("../drawing/Plan.svg");
  });
});

describe("the slash menu", () => {
  const openSlash = async (editor: MsEditor) => {
    await act(async () => {
      editor.view.focus();
      editor.handleOpenSlashMenu("draw", false);
    });
  };

  test("a new drawing, its picture inserted", async () => {
    const onCreateDrawing = vi.fn(async () => ({
      src: "../drawing/New.svg",
      alt: "New",
    }));
    const editor = setup({ onCreateDrawing }, "");
    await openSlash(editor);
    await act(async () => {
      fireEvent.click(screen.getByText("Drawing"));
    });
    expect(onCreateDrawing).toHaveBeenCalled();
    let image: { src?: string; alt?: string } | undefined;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === "image") image = node.attrs;
    });
    expect(image).toMatchObject({ src: "../drawing/New.svg", alt: "New" });
  });

  test("no drawing item if the app makes none", async () => {
    const editor = setup({}, "");
    await openSlash(editor);
    expect(screen.queryByText("Drawing")).toBeNull();
  });
});
