#!/usr/bin/env node
import { render } from 'ink';
import { App } from './app.js';
import { ensureConfigExists } from './config.js';
import { TorrentEngine } from './engine/torrent-engine.js';

const initialConfig = ensureConfigExists();
const engine = new TorrentEngine(initialConfig);

render(<App engine={engine} initialConfig={initialConfig} />);
