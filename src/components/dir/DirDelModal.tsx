import { BaseModal } from 'components/settings/BaseModal';
import { deleteFiles } from 'file/util';

type Props = {
  dirPath: string;
  isOpen: boolean;
  handleClose: () => void;
};

export default function DirDelModal(props: Props) {
  const { dirPath, isOpen, handleClose } = props;

  return (
    <BaseModal title="Delete This Folder?" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <p className="text-sm text-center">{dirPath}</p>
        <button className="mt-2 font-bold pop-btn" onClick={handleClose}>
          Cancel Delete
        </button>
        <button 
          className="mt-4 font-bold text-red-600 pop-btn" 
          onClick={async (e) => {
            e.preventDefault();
            await deleteFiles([dirPath]);
            handleClose();
          }}
        >
          Confirm Delete Folder and All Items
        </button>
      </div>
    </BaseModal>
  );
}
