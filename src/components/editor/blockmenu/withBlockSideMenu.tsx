import { ComponentType } from 'react';
import { isReferenceableBlockElement } from 'editor/checks';
import { ElementType } from 'editor/slate';
import { EditorElementProps } from '../elements/EditorElement';
import BacklinksPopover from './BacklinksPopover';
import BlockMenuDropdown from './BlockMenuDropdown';

export default function withBlockSideMenu(
  EditorElement: ComponentType<EditorElementProps>,
  isWiki: boolean,
) {
  const ElementWithSideMenu = (props: EditorElementProps) => {
    const { element } = props;

    if (!isReferenceableBlockElement(element) && element.type !== ElementType.Table) {
      return <EditorElement {...props} />;
    }

    return (
      <div className="relative w-full group before:absolute before:top-0 before:bottom-0 before:w-full before:right-full">
        <EditorElement {...props} />
        <BlockMenuDropdown
          element={element}
          isWiki={isWiki}
          /**
           * We're using opacity 0.001 here to support iOS Safari.
           * If we use anything else to hide this element, it would
           * require two taps to edit text (the first tap would display this element).
           */
          className="opacity-0.1 group-hover:opacity-100"
        />
        {element.type !== ElementType.Table ? (
          <BacklinksPopover element={element} isWiki={isWiki} />
        ): null}
      </div>
    );
  };

  return ElementWithSideMenu;
}
