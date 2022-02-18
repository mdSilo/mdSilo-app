import React from 'react';

type Props = {
  id: string;
  isChecked: boolean;
  setIsChecked: (isChecked: boolean) => void;
  className?: string;
};

export default function Toggle(props: Props) {
  const { id, className, isChecked, setIsChecked } = props;

  return (
    <div className={`flex flex-col ${className}`}>
      <label
        htmlFor={id}
        className="inline-flex items-center cursor-pointer"
      >
        <span className="relative">
          <span
            className={`block w-10 h-4 rounded-full shadow-inner transition-colors ${
              isChecked ? 'bg-primary-100' : 'bg-gray-400'
            }`}
          ></span>
          <span
            className={`absolute inset-y-0 left-0 block w-4 h-2 mt-1 ml-1 transition-transform duration-300 ease-in-out transform bg-white rounded-full shadow focus-within:shadow-outline ${
              isChecked ? 'translate-x-full' : null
            }`}
          >
            <input
              id={id}
              type="checkbox"
              className="absolute w-0 h-0 opacity-0"
              onClick={() => setIsChecked(!isChecked)}
            />
          </span>
        </span>
      </label>
    </div>
  );
}
