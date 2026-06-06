import { getDaemonBaseUrl, type AppConfig } from '../config.js';
import { pingDaemon } from '../daemon/ensure-daemon.js';
import { stopDaemonProcess } from '../daemon/instance.js';

export async function runStopDaemonCommand(config: AppConfig): Promise<number> {
  const baseUrl = getDaemonBaseUrl(config);
  if (await pingDaemon(baseUrl)) {
    const res = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    if (!res.ok) {
      console.error('Daemon shutdown request failed.');
      return 1;
    }
    await res.text();
    console.log('Daemon stopped.');
    return 0;
  }

  const stopped = await stopDaemonProcess();
  if (stopped) {
    console.log('Daemon stopped.');
    return 0;
  }
  console.log('No daemon running.');
  return 0;
}
