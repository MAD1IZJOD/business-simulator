import { describe, expect, it } from 'vitest';
import { launchedGame } from './helpers';
import { advanceMonths } from '../src/engine/step';
import { deserialize, serialize, metaOf, SaveError } from '../src/persistence/serialize';
import { MemoryBackend, SaveStore } from '../src/persistence/storage';

describe('save / load', () => {
  it('round-trips a game exactly, including Infinity values', () => {
    const s = launchedGame({ industry: 'saas' });
    advanceMonths(s, 6);
    s.reports[0].kpis.runwayMonths = Infinity;
    const text = serialize(s, metaOf(s));
    const { state } = deserialize(text);
    expect(state.reports[0].kpis.runwayMonths).toBe(Infinity);
    expect(JSON.stringify(state)).toBe(JSON.stringify(s));
  });

  it('a loaded game continues identically to the original', () => {
    const a = launchedGame({ seed: 99 });
    advanceMonths(a, 3);
    const b = deserialize(serialize(a, metaOf(a))).state;
    advanceMonths(a, 3);
    advanceMonths(b, 3);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('rejects corrupted, foreign or future-version files', () => {
    const s = launchedGame();
    const text = serialize(s, metaOf(s));
    const env = JSON.parse(text);
    env.stateJson = env.stateJson.replace('"day":0', '"day":5');
    expect(() => deserialize(JSON.stringify(env))).toThrow(SaveError);
    expect(() => deserialize('not json')).toThrow(SaveError);
    expect(() => deserialize(JSON.stringify({ hello: 'world' }))).toThrow(SaveError);
    const future = JSON.parse(text);
    future.version = 999;
    expect(() => deserialize(JSON.stringify(future))).toThrow(/newer/);
  });

  it('repairs recoverable problems such as NaN on load', () => {
    const s = launchedGame();
    s.company.brand = Number.NaN; // JSON turns NaN into null
    const text = serialize(s, metaOf(s));
    const { state, repaired } = deserialize(text);
    expect(repaired).toBeGreaterThan(0);
    expect(Number.isFinite(state.company.brand)).toBe(true);
  });

  it('manages multiple save slots', async () => {
    const store = new SaveStore(new MemoryBackend());
    const a = launchedGame({ companyName: 'Alpha' });
    const b = launchedGame({ companyName: 'Beta' });
    await store.save('slot1', a);
    await store.save('slot2', b);
    const list = await store.list();
    expect(list.map((x) => x.meta.company).sort()).toEqual(['Alpha', 'Beta']);
    const loaded = await store.load('slot2');
    expect(loaded.company.name).toBe('Beta');
    await store.remove('slot1');
    expect((await store.list()).length).toBe(1);
    await expect(store.load('slot1')).rejects.toThrow();
  });
});
