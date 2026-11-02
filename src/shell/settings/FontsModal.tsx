import { useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import FontsSetting from "./FontsSetting";

/** The fonts added by the user, a dialog of its own, from the settings */
export default function FontsModal() {
  const isOpen = useStore((state) => state.isFontsOpen);
  const setIsOpen = useStore((state) => state.setIsFontsOpen);
  return (
    <BaseModal
      title="Fonts"
      scrollBody
      isOpen={isOpen}
      handleClose={() => setIsOpen(false)}
    >
      <div className="p-3 text-sm text-left bg-base-200">
        <FontsSetting />
      </div>
    </BaseModal>
  );
}
