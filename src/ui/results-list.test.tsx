import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { render } from 'ink-testing-library';
import { ResultsList } from './results-list.js';
import type { CliflixSearchRow } from '../search/cliflix-search.js';
import { makeSnapshot } from '../test/helpers.js';

const row = (title: string, extra: Partial<CliflixSearchRow> = {}): CliflixSearchRow => ({
  title,
  seeders: 10,
  size: '1.2 GB',
  _torrent: { title },
  ...extra,
});

describe('ResultsList', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  const draw = (props: Partial<Parameters<typeof ResultsList>[0]> = {}) => {
    const r = render(
      <ResultsList
        results={[]}
        selectedIndex={0}
        page={0}
        pageCount={1}
        totalCount={0}
        pageSize={10}
        focused={false}
        titleMax={60}
        activeSnapshots={[]}
        {...props}
      />
    );
    unmount = r.unmount;
    return r.lastFrame() ?? '';
  };

  it('shows an empty hint', () => {
    const out = draw();
    assert.match(out, /Results/);
    assert.match(out, /No results — run a search/);
  });

  it('lists titles, seeders and sizes (string or bytes)', () => {
    const out = draw({
      results: [row('Alpha'), row('Beta', { seeders: undefined, size: 2048 }), row('Gamma', { size: undefined })],
      totalCount: 3,
      focused: true,
    });
    assert.match(out, /Results \(3\) \*/);
    assert.match(out, /Alpha 10S 1\.2 GB/);
    assert.match(out, /Beta \?S 2\.0 KB/);
    assert.match(out, /Gamma 10S \?/);
  });

  it('shows the page range when paginated', () => {
    const out = draw({ results: [row('X')], totalCount: 11, page: 1, pageCount: 2 });
    assert.match(out, /Results 2\/2 \(11-11 of 11\)/);
  });

  it('badges results that are already downloading', () => {
    const ih = 'e'.repeat(40);
    const out = draw({
      results: [row('Active', { _torrent: { title: 'Active', infoHash: ih } })],
      totalCount: 1,
      activeSnapshots: [makeSnapshot({ infoHash: ih, name: 'Active', progress: 0.5 })],
    });
    assert.match(out, /\[↓50%\] Active/);
  });

  it('truncates long titles', () => {
    const out = draw({ results: [row('T'.repeat(80))], totalCount: 1, titleMax: 20 });
    assert.match(out, /T{20} 10S/);
    assert.doesNotMatch(out, /T{21}/);
  });
});
