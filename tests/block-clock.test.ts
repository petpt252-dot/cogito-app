import { describe, expect, it } from 'vitest';
import { createBlockClock } from '../src/exercises/stall';

// A block's active time starts when the person presses Start, and starts again after a pause or a stall.

describe('block clock', () => {
  const setup = () => {
    let now = 0;
    let start = -1;
    const clock = createBlockClock((t) => (start = t), () => now);
    return { clock, at: (t: number) => (now = t), start: () => start };
  };

  it('instructions inside the exercise are not counted: the first Start moves the start time', () => {
    const c = setup();
    c.clock.reset(); // block shown at 0
    c.at(40_000); // 40 s reading the 3-back instructions
    c.clock.mark();
    expect(c.start()).toBe(40_000);
    c.at(50_000);
    c.clock.mark(); // a later start screen in the same block does not move it again
    expect(c.start()).toBe(40_000);
  });

  it('a pause restarts the block, and its start screen counts again', () => {
    const c = setup();
    c.clock.reset();
    c.clock.mark();
    c.at(90_000); // paused, then resumed: the block restarts
    c.clock.restart();
    expect(c.start()).toBe(90_000);
    c.at(95_000);
    c.clock.mark(); // the restarted block shows its Start screen again
    expect(c.start()).toBe(95_000);
  });
});
