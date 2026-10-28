import { useRef, useState, memo } from 'react';
import { Menu } from '@headlessui/react';
import { TbSortDescending as IconSortDescending, TbCheck as IconCheck } from 'react-icons/tb';
import { usePopper } from 'react-popper';
import { ReadableNameBySort, Sort } from '@/state/userSettings';
import { Tooltip } from '@/components/misc/ui';
import Portal from '@/components/misc/Portal';

type Props = {
  currentSort: Sort;
  setCurrentSort: (sort: Sort) => void;
};

const SidebarNotesSortDropdown = (props: Props) => {
  const { currentSort, setCurrentSort } = props;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(
    null
  );
  const { styles, attributes } = usePopper(buttonRef.current, popperElement, {
    placement: 'bottom-start',
  });

  return (
    <Menu>
      {({ open }) => (
        <>
          <Menu.Button
            className="rounded-sm hover:bg-base-content/10 active:bg-base-content/15"
            ref={buttonRef}
          >
            <Tooltip content="Sort">
              <span className="flex items-center justify-center w-6 h-6">
                <IconSortDescending
                  size={16}
                  className="text-base-content/70"
                />
              </span>
            </Tooltip>
          </Menu.Button>
          {open && (
            <Portal>
              <Menu.Items
                className="z-20 w-56 overflow-hidden bg-base-200 rounded-sm shadow-popover focus:outline-hidden"
                static
                ref={setPopperElement}
                style={styles.popper}
                {...attributes.popper}
              >
                {Object.values(Sort).map((sort, index, arr) => {
                  const isActive = currentSort === sort;
                  const showDivider =
                    (index + 1) % 2 === 0 && index !== arr.length - 1;
                  return (
                    <Menu.Item key={sort}>
                      {({ focus }) => (
                        <button
                          className={`flex w-full items-center px-4 py-2 text-left text-base-content text-sm ${
                            showDivider ? 'border-b border-base-300' : ''
                          } ${focus ? 'bg-base-content/10' : ''}`}
                          onClick={() => setCurrentSort(sort)}
                        >
                          <span
                            className={
                              isActive
                                ? 'text-primary'
                                : undefined
                            }
                          >
                            {ReadableNameBySort[sort]}
                          </span>
                          {isActive ? (
                            <IconCheck
                              size={18}
                              className="ml-1 text-primary"
                            />
                          ) : null}
                        </button>
                      )}
                    </Menu.Item>
                  );
                })}
              </Menu.Items>
            </Portal>
          )}
        </>
      )}
    </Menu>
  );
};

export default memo(SidebarNotesSortDropdown);
