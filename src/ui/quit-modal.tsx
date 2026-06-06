import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from './modal.js';

export type QuitState = {
  message: string;
  log: readonly string[];
};

export function QuitModal({
  state,
  areaWidth,
  areaHeight,
}: {
  state: QuitState;
  areaWidth: number;
  areaHeight: number;
}): React.ReactNode {
  const modalHeight = Math.min(areaHeight - 2, Math.max(10, 6 + state.log.length));

  return (
    <Modal
      title="Quitting"
      areaWidth={areaWidth}
      areaHeight={areaHeight}
      modalWidth={Math.min(areaWidth - 4, 64)}
      modalHeight={modalHeight}
      borderColor="red"
    >
      <Text bold color="yellow">
        {state.message}
      </Text>
      <Text dimColor>Downloads keep running in the background daemon.</Text>
      <Box flexDirection="column" marginTop={1}>
        {state.log.map((line, i) => {
          const current = i === state.log.length - 1;
          return (
            <Text key={`${i}-${line}`} dimColor={!current} color={current ? 'yellow' : undefined}>
              {current ? '▸ ' : '✓ '}
              {line}
            </Text>
          );
        })}
      </Box>
    </Modal>
  );
}
