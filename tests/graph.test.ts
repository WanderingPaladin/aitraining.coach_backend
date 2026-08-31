import { describe, expect, it } from 'vitest';
import { graphUtcDateTime } from '../src/lib/graph.js';

describe('graphUtcDateTime', () => {
  it('formats Graph UTC dateTime without milliseconds or Z', () => {
    expect(graphUtcDateTime(new Date('2026-09-01T16:30:00.000Z'))).toBe('2026-09-01T16:30:00');
  });
});
