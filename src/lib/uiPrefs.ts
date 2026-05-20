import { useSyncExternalStore } from "react";

const KEY = "cfg.showLineNo";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getSnapshot(): boolean {
  return read();
}

function getServerSnapshot(): boolean {
  return false;
}

export function setShowLineNumbers(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
  listeners.forEach((cb) => cb());
}

export function useShowLineNumbers(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [v, setShowLineNumbers];
}
