import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

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
    <Box flexDirection="column" alignItems="center" justifyContent="center">
      <Text color="cyan">{FRAMES[frame]}</Text>
      <Text color="green">
        {SPINNER[spin]} Loading torrent engine…
      </Text>
    </Box>
  );
}
