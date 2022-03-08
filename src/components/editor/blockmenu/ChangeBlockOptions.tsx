import { useMemo } from 'react';
import { ReactEditor, useSlate } from 'slate-react';
import {
  IconH1,
  IconH2,
  IconH3,
  IconBlockquote,
  IconList,
  IconListNumbers,
  IconBraces,
  IconTypography,
  TablerIcon,
  IconListCheck,
} from '@tabler/icons';
import { Element } from 'slate';
import { toggleElement, isElementActive } from 'editor/formatting';
import { ElementType } from 'editor/slate';
import Tooltip from 'components/misc/Tooltip';
import { DropdownItem } from 'components/misc/Dropdown';

type ChangeBlockOptionsProps = {
  element: Element;
  className?: string;
  optOuts?: string[];
};

export default function ChangeBlockOptions(props: ChangeBlockOptionsProps) {
  const { element, className = '', optOuts = [] } = props;
  return (
    <div className={`divide-y dark:divide-gray-700 ${className}`}>
      <div className="flex items-center justify-center overflow-y-auto">
        { !optOuts.includes('p') 
          ? <BlockButton
              format={ElementType.Paragraph}
              element={element}
              Icon={IconTypography}
              tooltip="Paragraph"
            />
          : null
        }
        { !optOuts.includes('h1') 
          ? <BlockButton
              format={ElementType.HeadingOne}
              element={element}
              Icon={IconH1}
              tooltip="Heading 1"
            />
          : null
        }
        { !optOuts.includes('h2') 
          ? <BlockButton
              format={ElementType.HeadingTwo}
              element={element}
              Icon={IconH2}
              tooltip="Heading 2"
            />
          : null
        }
        { !optOuts.includes('h3') 
          ? <BlockButton
              format={ElementType.HeadingThree}
              element={element}
              Icon={IconH3}
              tooltip="Heading 3"
            />
          : null
        }
        { !optOuts.includes('cl') 
          ? <BlockButton
              format={ElementType.CheckListItem}
              element={element}
              Icon={IconListCheck}
              tooltip="Checklist"
            />
          : null
        }
        { !optOuts.includes('bl') 
          ? <BlockButton
              format={ElementType.BulletedList}
              element={element}
              Icon={IconList}
              tooltip="Bulleted List"
            />
          : null
        }
        { !optOuts.includes('nl') 
          ? <BlockButton
              format={ElementType.NumberedList}
              element={element}
              Icon={IconListNumbers}
              tooltip="Numbered List"
            />
          : null
        }
        { !optOuts.includes('code') 
          ? <BlockButton
              format={ElementType.CodeBlock}
              element={element}
              Icon={IconBraces}
              tooltip="Code Block"
            />
          : null
        }
        { !optOuts.includes('quote') 
          ? <BlockButton
              format={ElementType.Blockquote}
              element={element}
              Icon={IconBlockquote}
              tooltip="Quote Block"
            />
          : null
        }
      </div>
    </div>
  );
}

type BlockButtonProps = {
  format: ElementType;
  element: Element;
  Icon: TablerIcon;
  tooltip?: string;
  className?: string;
};

const BlockButton = ({
  format,
  element,
  Icon,
  tooltip,
  className = '',
}: BlockButtonProps) => {
  const editor = useSlate();
  const path = useMemo(
    () => ReactEditor.findPath(editor, element),
    [editor, element]
  );
  const isActive = isElementActive(editor, format, path);

  return (
    <Tooltip content={tooltip} placement="top" disabled={!tooltip}>
      <span>
        <DropdownItem
          className={`flex items-center px-2 py-2 cursor-pointer rounded hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 ${className}`}
          onClick={() => toggleElement(editor, format, path, element)}
        >
          <Icon
            size={18}
            className={
              isActive
                ? 'text-primary-500 dark:text-primary-400'
                : 'text-gray-800 dark:text-gray-200'
            }
          />
        </DropdownItem>
      </span>
    </Tooltip>
  );
};
