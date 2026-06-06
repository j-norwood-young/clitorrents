import React, { useEffect, useState } from 'react';
import { Box, Text, useWindowSize } from 'ink';

const FRAMES = [
  `
   ██████╗██╗     ██╗████████╗ ██████╗ ██████╗ ██████╗ ███████╗███╗   ██╗████████╗███████╗
  ██╔════╝██║     ██║╚══██╔══╝██╔═══██╗██╔══██╗██╔══██╗██╔════╝████╗  ██║╚══██╔══╝██╔════╝
  ██║     ██║     ██║   ██║   ██║   ██║██████╔╝██████╔╝█████╗  ██╔██╗ ██║   ██║   ███████╗
  ██║     ██║     ██║   ██║   ██║   ██║██╔══██╗██╔══██╗██╔══╝  ██║╚██╗██║   ██║   ╚════██║
  ╚██████╗███████╗██║   ██║   ╚██████╔╝██║  ██║██║  ██║███████╗██║ ╚████║   ██║   ███████║
   ╚═════╝╚══════╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
`,
  `
   ░█████╗██╗     ██╗████████╗ ██████╗ ██████╗ ██████╗ ███████╗███╗   ██╗████████╗███████╗
  ██╔════╝██║     ██║╚══██╔══╝██╔═══██╗██╔══██╗██╔══██╗██╔════╝████╗  ██║╚══██╔══╝██╔════╝
  ██║     ██║     ██║   ██║   ██║   ██║██████╔╝██████╔╝█████╗  ██╔██╗ ██║   ██║   ███████╗
  ██║     ██║     ██║   ██║   ██║   ██║██╔══██╗██╔══██╗██╔══╝  ██║╚██╗██║   ██║   ╚════██║
  ╚██████╗███████╗██║   ██║   ╚██████╔╝██║  ██║██║  ██║███████╗██║ ╚████║   ██║   ███████║
   ╚═════╝╚══════╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
`,
];

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Splash({
  onDone,
  minMs = 1200,
}: {
  onDone: () => void;
  minMs?: number;
}): React.ReactNode {
  const { columns = 80, rows = 24 } = useWindowSize();
  const [frame, setFrame] = useState(0);
  const [spin, setSpin] = useState(0);
  const started = React.useRef(Date.now());

  useEffect(() => {
    const iv = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
      setSpin((s) => (s + 1) % SPINNER.length);
    }, 120);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const elapsed = Date.now() - started.current;
    const wait = Math.max(0, minMs - elapsed);
    const t = setTimeout(onDone, wait);
    return () => clearTimeout(t);
  }, [minMs, onDone]);

  return (
    <Box width={columns} height={rows} flexDirection="column" overflow="hidden">
      <Box flexGrow={1} />
      <Box flexDirection="column" alignItems="center" width={columns}>
        <Text color="cyan">{FRAMES[frame]}</Text>
        <Text color="green">
          {SPINNER[spin]} Loading torrent engine…
        </Text>
      </Box>
      <Box flexGrow={1} />
    </Box>
  );
}
