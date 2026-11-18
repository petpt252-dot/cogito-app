import { createContext, useContext } from 'react';

/**
 * Timed presentations report a stall (a step that started too late, see runSequence) through this
 * context. Outside a TimingGuard the report is undefined, so components still work on their own (e.g. in tests).
 */
export const StallContext = createContext<(() => void) | undefined>(undefined);
export const useStallHandler = () => useContext(StallContext);

/**
 * When a block's active time starts. The runner starts it when the block is shown; a start screen inside the
 * exercise (`mark`, from Gate) moves it to the moment the person presses Start, and a restart after a pause or a
 * stall (`restart`) starts it again, so reading instructions and pausing are not counted as training time.
 */
export interface BlockClock {
  mark: () => void;
  restart: () => void;
}
export const BlockClockContext = createContext<BlockClock | undefined>(undefined);
export const useBlockClock = () => useContext(BlockClockContext);

/** A BlockClock writing the active start through `setStart`; `reset` is called when a new block is shown. */
export function createBlockClock(setStart: (t: number) => void, now: () => number = Date.now): BlockClock & { reset: () => void } {
  let armed = false;
  return {
    mark: () => {
      if (armed) return;
      armed = true;
      setStart(now());
    },
    restart: () => {
      armed = false;
      setStart(now());
    },
    reset: () => {
      armed = false;
      setStart(now());
    },
  };
}
