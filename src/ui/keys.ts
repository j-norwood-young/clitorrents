/** True when the user pressed Ctrl+Q (quit). */
export function isQuitKey(input: string, key: { ctrl?: boolean }): boolean {
  if (!key.ctrl) return false;
  const ch = input.toLowerCase();
  return ch === 'q' || input === '\x11';
}
