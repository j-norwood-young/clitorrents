/**
 * Local torrent swarm for manual testing: tracker + seeder + search API on 127.0.0.1.
 *
 *   npm run mock-server [-- --port 8787]
 *   CLITORRENTS_MOCK_SERVER=http://127.0.0.1:8787 npm run dev
 */
import { startMockTorrentServer } from '../src/test/mock-torrent-server.js';

const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8787;

const server = await startMockTorrentServer({ port });

console.log(`Mock torrent server: ${server.url}`);
console.log(`Tracker:             ${server.trackerUrl}\n`);
for (const t of server.torrents) {
  console.log(`${t.name}`);
  console.log(`  magnet:  ${t.magnet}`);
  console.log(`  torrent: ${server.url}/torrent/${t.infoHash}.torrent\n`);
}
console.log('Use it from the app:');
console.log(`  CLITORRENTS_MOCK_SERVER=${server.url} npm run dev        # TUI, search "mock"`);
console.log(`  CLITORRENTS_MOCK_SERVER=${server.url} npm run search -- mock`);
console.log('\nCtrl+C to stop.');

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
