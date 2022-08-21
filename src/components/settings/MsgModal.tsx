import { useStore } from 'lib/store';
import { BaseModal } from './BaseModal';

export default function MsgModal() {
  const msgModalText = useStore((state) => state.msgModalText);
  const setMsgModalText = useStore((state) => state.setMsgModalText);
  const msgModalOpen = useStore((state) => state.msgModalOpen);
  const setMsgModalOpen = useStore((state) => state.setMsgModalOpen);
  const isOpen = msgModalOpen && Boolean(msgModalText.trim());
  const handleClose = () => { 
    setMsgModalOpen(false);
    setMsgModalText('');
  };

  return (
    <BaseModal title="" isOpen={isOpen} handleClose={handleClose}>
      <div className="flex flex-col justify-center px-6">
        <button>{msgModalText}</button>
      </div>
    </BaseModal>
  );
}
