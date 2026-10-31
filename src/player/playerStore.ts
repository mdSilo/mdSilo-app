import { create } from 'zustand';

/**
 * The player of the app, shown or hidden by its button in the side menu:
 * a podcast, a book read aloud, one at a time; starting one pauses the other.
 */

type PlayerStore = {
  shown: boolean;
  setShown: (shown: boolean) => void;
  /** the settings of the speech engines, open over the player */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
};

export const usePlayer = create<PlayerStore>((set) => ({
  shown: false,
  setShown: (shown) => set({ shown }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));

export type PlayerSource = 'podcast' | 'tts';

const pausers = new Map<PlayerSource, () => void>();

/** How to pause a source when another one plays. */
export function onPauseRequest(source: PlayerSource, pause: () => void) {
  pausers.set(source, pause);
  return () => {
    if (pausers.get(source) === pause) pausers.delete(source);
  };
}

/** A source starts playing: the others pause, the player is shown. */
export function playing(source: PlayerSource) {
  for (const [other, pause] of pausers) if (other !== source) pause();
  usePlayer.getState().setShown(true);
}
