import React from 'react';
import { Text } from 'ink';

export function SearchField({
  value,
  cursor,
  focused,
  dimmed = false,
  prefix = '> ',
}: {
  value: string;
  cursor: number;
  focused: boolean;
  dimmed?: boolean;
  prefix?: string;
}): React.ReactNode {
  const safeCursor = Math.min(Math.max(0, cursor), value.length);
  const before = value.slice(0, safeCursor);
  const after = value.slice(safeCursor);
  const inactive = dimmed || !focused;

  return (
    <Text dimColor={inactive}>
      {focused && !dimmed ? <Text bold color="cyan">Search </Text> : <Text>Search </Text>}
      <Text>{prefix}</Text>
      {before}
      {focused && !dimmed ? (
        <>
          <Text inverse>{after.length > 0 ? after[0] : ' '}</Text>
          {after.slice(1)}
        </>
      ) : (
        after
      )}
    </Text>
  );
}
