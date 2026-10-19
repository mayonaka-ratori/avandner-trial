import { useState } from "react";

export const TEXT_SIZE_KEY = "avandner-trial-large-text";

export function useStoredBoolean(key: string): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) === "true"; } catch { return false; }
  });
  function toggle() {
    const next = !value;
    setValue(next);
    try { localStorage.setItem(key, String(next)); } catch { /* 保存できなくても切り替える。 */ }
  }
  return [value, toggle];
}
