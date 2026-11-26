type ScreenState = 'off' | 'active' | 'unavailable';

export function makeScreenWakeLock(report: (state: ScreenState) => void) {
  let enabled = false;
  let leaving = false;
  let wanted = false;
  let generation = 0;
  let pending = false;
  let lock: WakeLockSentinel | undefined;

  async function sync() {
    const next = enabled && !leaving && document.visibilityState === 'visible';
    if (next !== wanted) {
      wanted = next;
      generation++;
    }
    if (!wanted) {
      const previous = lock;
      lock = undefined;
      report('off');
      await previous?.release().catch(() => {});
      return;
    }
    if (lock || pending) return;
    if (!navigator.wakeLock) {
      report('unavailable');
      return;
    }

    pending = true;
    const requestGeneration = generation;
    try {
      const acquired = await navigator.wakeLock.request('screen');
      if (wanted && generation === requestGeneration && !acquired.released) {
        lock = acquired;
        acquired.addEventListener('release', () => {
          if (lock !== acquired) return;
          lock = undefined;
          report(wanted ? 'unavailable' : 'off');
        }, { once: true });
        report('active');
      } else {
        await acquired.release();
        if (wanted && generation === requestGeneration) report('unavailable');
      }
    } catch {
      if (wanted && generation === requestGeneration) report('unavailable');
    } finally {
      pending = false;
      if (wanted && generation !== requestGeneration) void sync();
    }
  }

  document.addEventListener('visibilitychange', () => { void sync(); });
  window.addEventListener('pagehide', () => {
    leaving = true;
    void sync();
  });
  window.addEventListener('pageshow', () => {
    if (!leaving) return;
    leaving = false;
    void sync();
  });
  return {
    setEnabled(next: boolean) {
      if (next === enabled) return;
      enabled = next;
      void sync();
    },
  };
}
