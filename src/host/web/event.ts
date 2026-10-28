/**
 * Web stand-in of `@tauri-apps/api/event`, aliased in vite.web.config.ts.
 */
import { BusEvent, emit as busEmit, on } from './watch';

export type Event<T> = BusEvent<T>;
export type EventCallback<T> = (event: Event<T>) => void;
export type UnlistenFn = () => void;

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  return on(event, handler as EventCallback<unknown>);
}

export async function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  const unlisten = on(event, (e) => {
    unlisten();
    (handler as EventCallback<unknown>)(e);
  });
  return unlisten;
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  busEmit(event, payload);
}
