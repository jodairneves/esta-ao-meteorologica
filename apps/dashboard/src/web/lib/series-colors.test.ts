import { describe, expect, it } from 'vitest';
import { colorSlots } from './series-colors';

const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('colorSlots', () => {
  it('gives each station the slot of its place in the full list', () => {
    expect(colorSlots(all, ['a', 'c'])).toEqual(
      new Map([
        ['a', '--series-1'],
        ['c', '--series-3'],
      ]),
    );
  });

  it('keeps the survivors colours when the selection shrinks', () => {
    const before = colorSlots(all, ['a', 'b', 'c']);
    const after = colorSlots(all, ['a', 'c']);
    expect(after.get('a')).toBe(before.get('a'));
    expect(after.get('c')).toBe(before.get('c'));
  });

  it('moves only a clashing station to the next free slot', () => {
    // "g" (7th) wraps to slot 1, already taken by "a".
    expect(colorSlots(all, ['a', 'g'])).toEqual(
      new Map([
        ['a', '--series-1'],
        ['g', '--series-2'],
      ]),
    );
  });

  it('never hands out more than the six fixed slots', () => {
    const slots = colorSlots(all, all);
    expect(slots.size).toBe(6);
    expect(new Set(slots.values()).size).toBe(6);
  });
});
