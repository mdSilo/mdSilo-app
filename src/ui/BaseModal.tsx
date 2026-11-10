/*
The following was modified from the source code:
https://github.com/cwackerfuss/react-wordle/blob/main/src/components/modals/BaseModal.tsx

MIT License Copyright (c) 2022 Hannah Park
*/

import { Fragment } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { TbX as IconX } from "react-icons/tb";
import { useT } from "@/i18n";

type Props = {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  handleClose: () => void;
  /** classes for the panel, to override the default small width */
  panelClassName?: string;
  /**
   * the content scrolls inside the panel, under its title, and the panel is
   * no higher than the window; otherwise the dialog grows and scrolls itself
   */
  scrollBody?: boolean;
};

export const BaseModal = ({
  title,
  children,
  isOpen,
  handleClose,
  panelClassName = "max-w-sm",
  scrollBody = false,
}: Props) => {
  const t = useT();
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed z-40 inset-0 overflow-y-auto"
        onClose={handleClose}
      >
        <div className="flex items-center justify-center min-h-screen p-1 text-center">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            {/* a click outside the panel closes: by the backdrop itself, not
                only by Dialog's outside click, which some webviews miss */}
            <div
              className="fixed inset-0 bg-gray-500/75 transition-opacity"
              aria-hidden="true"
              onClick={() => handleClose()}
            />
          </TransitionChild>
          <span
            className="hidden sm:inline-block sm:align-middle sm:h-screen"
            aria-hidden="true"
          >
            &#8203;
          </span>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <DialogPanel
              className={`relative inline-block bg-base-100 rounded-sm p-4 overflow-hidden shadow-xl transform transition-all w-full ${panelClassName}`}
            >
              <button
                className="absolute right-4 top-4"
                aria-label={t("Close")}
                onClick={() => handleClose()}
              >
                <IconX size={20} className="text-base-content/60" />
              </button>
              <div>
                <div className="text-center">
                  <DialogTitle
                    as="h3"
                    className="text-lg leading-6 font-medium text-base-content"
                  >
                    {title}
                  </DialogTitle>
                  <div
                    className={
                      scrollBody
                        ? "mt-2 max-h-[calc(100vh-8rem)] pr-2 overflow-y-auto overscroll-contain"
                        : "mt-2"
                    }
                  >
                    {children}
                  </div>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};
