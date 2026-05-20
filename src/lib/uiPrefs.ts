import { useSyncExternalStore } from "react";

type PrefKey = "cfg.showLineNo" | "cfg.showFullPortRange";

const defaults: Record<PrefKey, boolean> = {
  "cfg.showLineNo": false,
  "cfg.showFullPortRange": false,
};

function read(key: PrefKey): boolean {
  if (typeof window === "undefined") return defaults[key];
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return defaults[key];
    return v === "1";
  } catch {
    return defaults[key];
  }
}

const listeners = new Map<PrefKey, Set<() => void>>();

function getListeners(key: PrefKey) {
  let s = listeners.get(key);
  if (!s) {
    s = new Set();
    listeners.set(key, s);
  }
  return s;
}

function makeSubscribe(key: PrefKey) {
  return (cb: () => void) => {
    const s = getListeners(key);
    s.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) cb();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    return () => {
      s.delete(cb);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  };
}

function setPref(key: PrefKey, v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, v ? "1" : "0");
  } catch {
    // ignore
  }
  getListeners(key).forEach((cb) => cb());
}

function useBoolPref(key: PrefKey): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    makeSubscribe(key),
    () => read(key),
    () => defaults[key],
  );
  return [v, (nv: boolean) => setPref(key, nv)];
}

export const setShowLineNumbers = (v: boolean) => setPref("cfg.showLineNo", v);
export const useShowLineNumbers = () => useBoolPref("cfg.showLineNo");

export const setShowFullPortRange = (v: boolean) =>
  setPref("cfg.showFullPortRange", v);
export const useShowFullPortRange = () => useBoolPref("cfg.showFullPortRange");
