import { memo, useEffect, useRef } from 'react';
import { 
  IconBookmark, IconAlien, IconLink, IconBook, IconCalendar, IconBarcode 
} from '@tabler/icons';
import { useStore } from 'lib/store';

type Props = {
  traitKey: string;
  initialVal: string;
  setAttr: (k: string, value: string) => void;
  onChange: (value: string) => void;
  className?: string;
};

// TODO: can custom adding
function Trait(props: Props) {
  const { traitKey, initialVal, setAttr, onChange, className = '' } = props;
  const traitRef = useRef<HTMLInputElement | null>(null);

  const isCheckSpellOn = useStore((state) => state.isCheckSpellOn);
  const readMode = useStore((state) => state.readMode);

  const emitChange = () => {
    if (!traitRef.current) {
      return;
    }
    const value = traitRef.current.value ?? '';
    setAttr(traitKey, value);
    onChange(value);
  };

  // Set the initial trait
  useEffect(() => {
    if (!traitRef.current || traitRef.current.value) {
      return;
    }
    traitRef.current.value = initialVal;
  }, [initialVal]);

  const iconClass = "flex-shrink-0 mr-1 text-gray-800 dark:text-gray-300";
  const types = ['Book', 'Documentary', 'Film', 'Game', 'Music', 'Paper', 'Podcast', 'Story', 'TV'];

  return (
    <div className={`flex items-center px-8 md:px-12 py-1 ${className}`}>
      <div className="trait-key flex items-center w-24">
        {mapKeyIcon(traitKey, iconClass)}
        <span className="overflow-x-hidden select-none overflow-ellipsis whitespace-nowrap">
          {traitKey}
        </span>
      </div>
      <input
        ref={traitRef}
        className="trait-val text-sm p-1 border-none outline-none focus:ring-transparent cursor-text appearance-none dark:bg-gray-900"
        type={traitKey === 'Publish' ? 'date' : 'text'}
        list={traitKey === 'Type' ? "trait-types" : ''}
        placeholder="..."
        onInput={emitChange}
        disabled={readMode}
        spellCheck={isCheckSpellOn}
      />
      {traitKey === 'Type' ? (
        <datalist id="trait-types">
          {types.map((k) => <option key={k} value={k} />)}
        </datalist>
      ) : null}
    </div>
  );
}

export default memo(Trait);

export const TraitKeys: string[] = ['Type', 'Author', 'Publisher', 'Publish', 'UID', 'Link'];

export enum TraitKey {
  Author = 'Author',
  Type = 'Type',
  Publisher = 'Publisher',
  Publish = 'Publish',
  UID = 'UID',
  Link = 'Link',
}

// select an Icon for a trait key
const mapKeyIcon = (k: string, className: string, size = 16) => {
  const keyMapIcon = new Map();
  keyMapIcon.set('Type', (<IconBookmark size={size} className={className} />));
  keyMapIcon.set('Author', (<IconAlien size={size} className={className} />));
  keyMapIcon.set('Publisher', (<IconBook size={size} className={className} />));
  keyMapIcon.set('Publish', (<IconCalendar size={size} className={className} />));
  keyMapIcon.set('UID', (<IconBarcode size={size} className={className} />));
  keyMapIcon.set('Link', (<IconLink size={size} className={className} />));

  return keyMapIcon.get(k);
};
