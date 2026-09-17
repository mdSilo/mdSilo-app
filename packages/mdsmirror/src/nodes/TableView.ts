import { Node } from "prosemirror-model";
import { TableView as ProsemirrorTableView } from "prosemirror-tables";
import { TableLayout } from "../core/rules/tables";

export class TableView extends ProsemirrorTableView {
  public constructor(
    public node: Node,
    public cellMinWidth: number
  ) {
    super(node, cellMinWidth);

    this.dom.removeChild(this.table);
    this.dom.classList.add('table-wrapper');

    // Add an extra wrapper to enable scrolling
    this.scrollable = this.dom.appendChild(document.createElement("div"));
    this.scrollable.appendChild(this.table);
    this.scrollable.classList.add('table-scrollable');

    this.scrollable.addEventListener(
      "scroll",
      () => {
        this.updateClassList(this.node);
      },
      {
        passive: true,
      }
    );

    this.updateClassList(node);

    // We need to wait for the next tick to ensure dom is rendered and scroll shadows are correct.
    setTimeout(() => {
      if (this.dom) {
        this.updateClassList(node);
      }
    }, 0);
  }

  public override update(node: Node) {
    this.updateClassList(node);
    return super.update(node);
  }

  public override ignoreMutation(record: MutationRecord): boolean {
    if (
      record.type === "attributes" &&
      record.target === this.dom &&
      (record.attributeName === "class" || record.attributeName === "style")
    ) {
      return true;
    }

    return (
      record.type === "attributes" &&
      (record.target === this.table || this.colgroup.contains(record.target))
    );
  }

  private updateClassList(node: Node) {
    this.dom.classList.toggle(
      'table-full-width',
      node.attrs.layout === TableLayout.fullWidth
    );

    const shadowLeft = !!(this.scrollable && this.scrollable.scrollLeft > 0);
    const shadowRight = !!(
      this.scrollable &&
      this.scrollable.scrollWidth > this.scrollable.clientWidth &&
      this.scrollable.scrollLeft + this.scrollable.clientWidth <
        this.scrollable.scrollWidth - 1
    );

    this.dom.classList.toggle('table-shadow-left', shadowLeft);
    this.dom.classList.toggle('table-shadow-right', shadowRight);

    if (this.scrollable) {
      this.dom.style.setProperty(
        "--table-height",
        `${this.scrollable?.clientHeight}px`
      );
      this.dom.style.setProperty(
        "--table-width",
        `${this.scrollable?.clientWidth}px`
      );
    } else {
      this.dom.style.removeProperty("--table-height");
      this.dom.style.removeProperty("--table-width");
    }
  }

  private scrollable: HTMLDivElement | null = null;
}
