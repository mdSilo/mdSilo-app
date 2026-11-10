import { useEffect } from "react";
import { useStore } from "@/state/store";
import { setLanguage } from "./index";

/** apply the language of the settings, once they load and when changed */
export function useLanguage() {
  const language = useStore((state) => state.language);
  useEffect(() => {
    void setLanguage(language);
  }, [language]);
}
