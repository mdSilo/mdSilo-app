
import Toggle from 'components/misc/Toggle';

type Props = {
  name: string;
  descript?: string;
  check: boolean;
  handleCheck: (isChecked: boolean) => void;
  optionLeft?: string;
  optionRight?: string;
}

export const SettingsToggle = (props: Props) => {
  const {
    name, 
    descript, 
    check, 
    handleCheck,
    optionLeft = 'Off', 
    optionRight = 'On', 
  } = props;
  
  return (
    <div className="flex flex-col items-center mb-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold">{name}</h1>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          {descript}
        </p>
      </div>
      <div className="flex flex-row items-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">{optionLeft}</span>
        <Toggle
          id="page-stack"
          className="items-center mx-2"
          isChecked={check}
          setIsChecked={handleCheck}
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">{optionRight}</span>
      </div>
    </div>
  );
}
