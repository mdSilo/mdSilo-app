/*
The following was modified from the source code:
https://github.com/cwackerfuss/react-wordle/blob/main/src/components/modals/BaseModal.tsx

MIT License Copyright (c) 2022 Hannah Park
*/

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { IconX } from '@tabler/icons-react';

type Props = {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  handleClose: () => void;
}

export const BaseModal = ({ title, children, isOpen, handleClose }: Props) => {
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed z-20 inset-0 overflow-y-auto"
        onClose={handleClose}
      >
        <div className="flex items-center justify-center min-h-screen p-2 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
            />
          </Transition.Child>
          <span
            className="hidden sm:inline-block sm:align-middle sm:h-screen"
            aria-hidden="true"
          >
            &#8203;
          </span>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <div className="inline-block bg-white rounded p-4 overflow-hidden shadow-xl transform transition-all max-w-sm w-full">
              <div className="absolute right-4 top-4">
                <IconX 
                  size={24} 
                  className="cursor-pointer"
                  onClick={() => handleClose()}
                />
              </div>
              <div>
                <div className="text-center">
                  <Dialog.Title
                    as="h3"
                    className="text-lg leading-6 font-medium text-gray-900"
                  >
                    {title}
                  </Dialog.Title>
                  <div className="mt-2">{children}</div>
                </div>
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
