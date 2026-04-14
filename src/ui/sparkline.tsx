import React from 'react';
import { Text } from 'ink';

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function Sparkline({
  values,
  width,
}: {
  values: readonly number[];
  width: number;
}): React.ReactNode {
  if (values.length === 0) {
    return <Text dimColor>·</Text>;
  }
  const slice = values.slice(-Math.max(1, width));
  const max = Math.max(...slice, 1e-6);
  const chars = slice.map((v) => {
    const t = Math.min(1, v / max);
    const i = Math.min(BLOCKS.length - 1, Math.floor(t * (BLOCKS.length - 1)));
    return BLOCKS[i];
  });
  return <Text>{chars.join('')}</Text>;
}
