import { describe, it, expect } from 'vitest';
import { finishToRoughness } from './materials.js';
import type { Finish } from './schema.js';

describe('finishToRoughness', () => {
  it('gets glossier (lower roughness) as the finish goes matte -> gloss', () => {
    const order: Finish[] = ['matte', 'eggshell', 'satin', 'gloss'];
    const values = order.map(finishToRoughness);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('stays within a valid roughness range', () => {
    for (const f of ['matte', 'eggshell', 'satin', 'gloss'] as Finish[]) {
      const r = finishToRoughness(f);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});
