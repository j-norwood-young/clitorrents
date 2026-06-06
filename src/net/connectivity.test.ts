import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConnectivityMonitor } from './connectivity.js';

describe('ConnectivityMonitor', () => {
  it('reports online when probe succeeds', async () => {
    const monitor = new ConnectivityMonitor({
      probe: async () => true,
    });
    assert.equal(await monitor.checkNow(), 'online');
    assert.equal(monitor.isOnline(), true);
  });

  it('reports offline when probe fails', async () => {
    const monitor = new ConnectivityMonitor({
      probe: async () => false,
    });
    assert.equal(await monitor.checkNow(), 'offline');
    assert.equal(monitor.isOnline(), false);
  });

  it('emits change events when state flips', async () => {
    let online = false;
    const monitor = new ConnectivityMonitor({
      probe: async () => online,
    });

    const states: string[] = [];
    monitor.on('change', (s) => states.push(s));

    await monitor.checkNow();
    online = true;
    await monitor.checkNow();

    assert.deepEqual(states, ['offline', 'online']);
  });

  it('stop clears scheduled polling', async () => {
    const monitor = new ConnectivityMonitor({
      probe: async () => true,
      onlineIntervalMs: 50,
    });
    monitor.start();
    await monitor.checkNow();
    monitor.stop();
    assert.equal(monitor.getState(), 'online');
  });
});
