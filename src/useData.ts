import { useEffect, useState } from 'react';
import { db } from './core/storage';
import type { AdaptiveState, AssessmentRecord, DelayedProbe, SessionRecord, TrialResult } from './core/types';
import { useApp } from './state';

export interface AppData {
  trials: TrialResult[];
  sessions: SessionRecord[];
  assessments: AssessmentRecord[];
  probes: DelayedProbe[];
  adaptive: AdaptiveState[];
  loaded: boolean;
}

const EMPTY: AppData = { trials: [], sessions: [], assessments: [], probes: [], adaptive: [], loaded: false };

/** Loads everything from IndexedDB; reloads whenever the app's data version changes. */
export function useData(): AppData {
  const { version, reportStorageError } = useApp();
  const [data, setData] = useState<AppData>(EMPTY);
  useEffect(() => {
    let alive = true;
    Promise.all([db.trials(), db.sessions(), db.assessments(), db.probes(), db.allAdaptive()]).then(([trials, sessions, assessments, probes, adaptive]) => {
      if (alive) setData({ trials, sessions, assessments, probes, adaptive, loaded: true });
    }).catch(() => {
      // Show the app with what we have instead of an endless loading screen, and tell the user.
      if (alive) setData((d) => ({ ...d, loaded: true }));
      reportStorageError();
    });
    return () => {
      alive = false;
    };
  }, [version]);
  return data;
}
