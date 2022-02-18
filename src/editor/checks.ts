import { Element } from 'slate';
import { ReferenceableBlockElement, ElementType } from 'editor/slate';

// Returns true if the element is of type ReferenceableBlockElement, false otherwise
export const isReferenceableBlockElement = (
  element: Element
): element is ReferenceableBlockElement => {
  return (
    element.type === ElementType.Paragraph ||
    element.type === ElementType.HeadingOne ||
    element.type === ElementType.HeadingTwo ||
    element.type === ElementType.HeadingThree ||
    element.type === ElementType.ListItem ||
    element.type === ElementType.Blockquote ||
    element.type === ElementType.CodeBlock ||
    element.type === ElementType.ThematicBreak ||
    element.type === ElementType.Image ||
    element.type === ElementType.BlockReference ||
    element.type === ElementType.CheckListItem
  );
};

export const isTextType = (
  type: ElementType
): type is
  | ElementType.Paragraph
  | ElementType.HeadingOne
  | ElementType.HeadingTwo
  | ElementType.HeadingThree => {
  return (
    type === ElementType.Paragraph ||
    type === ElementType.HeadingOne ||
    type === ElementType.HeadingTwo ||
    type === ElementType.HeadingThree
  );
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FileSystemAccess {

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export function support(obj: any & Window): boolean {
		if (typeof obj?.showDirectoryPicker === 'function') {
			return true;
		}

		return false;
	}
}
