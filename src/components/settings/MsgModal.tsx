import { BaseModal } from './BaseModal';

type Props = {
  isOpen: boolean;
  msg: string;
  handleClose: () => void;
}

export default function MsgModal(props: Props) {
  const {isOpen, msg, handleClose} = props;

  return (
    <BaseModal title="" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <button>{msg}</button>
      </div>
    </BaseModal>
  );
}
