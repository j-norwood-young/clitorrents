import React from 'react';
import { Box, Text } from 'ink';

/** Slightly elevated panel — reads as a dialog on dark terminals */
export const MODAL_PANEL_BG = '#1a1a1a';

export function computeModalPlacement(
  areaWidth: number,
  areaHeight: number,
  modalWidth: number,
  modalHeight: number
): { marginLeft: number; marginTop: number; width: number; height: number } {
  const width = Math.max(24, Math.min(modalWidth, areaWidth - 2));
  const height = Math.max(8, Math.min(modalHeight, areaHeight - 2));
  return {
    width,
    height,
    marginLeft: Math.max(0, Math.floor((areaWidth - width) / 2)),
    marginTop: Math.max(0, Math.floor((areaHeight - height) / 2)),
  };
}

/**
 * Web-like modal: main UI stays visible (dimmed by parent), dialog is a solid
 * rounded panel with a subtle offset shadow — no full-screen opaque scrim.
 */
export function Modal({
  title,
  areaWidth,
  areaHeight,
  modalWidth,
  modalHeight,
  borderColor = 'magenta',
  children,
}: {
  title: string;
  areaWidth: number;
  areaHeight: number;
  modalWidth: number;
  modalHeight: number;
  borderColor?: string;
  children: React.ReactNode;
}): React.ReactNode {
  const { marginLeft, marginTop, width, height } = computeModalPlacement(
    areaWidth,
    areaHeight,
    modalWidth,
    modalHeight
  );

  return (
    <>
      <Box
        position="absolute"
        marginLeft={marginLeft + 1}
        marginTop={marginTop + 1}
        width={width}
        height={height}
        borderStyle="round"
        borderColor="gray"
        backgroundColor="black"
      />
      <Box
        position="absolute"
        marginLeft={marginLeft}
        marginTop={marginTop}
        width={width}
        height={height}
        borderStyle="round"
        borderColor={borderColor}
        backgroundColor={MODAL_PANEL_BG}
        flexDirection="column"
        paddingX={1}
      >
        <Text bold color={borderColor} backgroundColor={MODAL_PANEL_BG}>
          {title}
        </Text>
        <Box
          flexDirection="column"
          flexGrow={1}
          overflow="hidden"
          backgroundColor={MODAL_PANEL_BG}
        >
          {children}
        </Box>
      </Box>
    </>
  );
}
