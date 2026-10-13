import { useEffect, useState } from "react";

export function useSettled(value, delayWhenFalse = 450) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), value ? 0 : delayWhenFalse);
    return () => clearTimeout(id);
  }, [value, delayWhenFalse]);

  return settled;
}
