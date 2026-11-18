# COGITO (app)

Offline-first cognitive training app (formerly "Memory Lab"; not affiliated with the COGITO study) (React + TypeScript + Tailwind, IndexedDB, PWA). English by default, European Portuguese optional.

```
npm install
npm run dev        # http://localhost:5173
npm test           # automated tests (vitest; 200+)
npm run build      # static build in dist/ with a precaching service worker
npm run preview    # serve the production build on :5190
npm run app        # run as a Windows desktop app (Electron)
npm run dist:win   # build release/COGITO-Setup-x.y.z-x64.exe and release/COGITO-Portable-x.y.z-x64.exe
```

The desktop app serves `dist/` over a private `app://` scheme; data is stored in `%APPDATA%\COGITO`. `COGITO.exe --smoke-test` starts with a throwaway profile, checks that the dashboard renders and exits 0.

## What's inside

| Module | Exercises |
|---|---|
| A Verbal episodic | A1 word list (10–40 words, free recall, delayed recall), A2 semantic organisation (ARC clustering), A3 recognition (hit/FA rate, d′ and log-linear d′) |
| B Associative | B1 paired associates, B2 face–name (procedural SVG faces), B3 object–location (recognition scored separately from binding) |
| C Visual episodic | C1 grid patterns 3×3–6×6, C2 scene memory (identity/position/colour/relation/change), C3 visual sequences (item vs order conditions) |
| D Narrative | D1 story recall with idea-unit rubric + user review + temporal order, D2 event sequence, D3 immediate vs delayed narrative recall |
| E Working memory (separate category) | E1 digit span forward/backward/sequencing, E2 running memory, E3 memory updating, E4 spatial/verbal/dual n-back |
| G COGITO-inspired memory & WM | G1 sequential word learning (item + serial order, up to 36 words), G2 number–noun pairs, G3 object positions on 6×6 (position + order), G4 alpha span (letters/words), G5 numerical updating (4 values, adaptive speed), G6 spatial 3-back on 4×4 (adaptive rate) |
| P COGITO-inspired perceptual speed | P1 odd–even, P2 vowel–consonant, P3 symmetry, P4 number comparison, P5 letter comparison, P6 3D figure comparison — adaptive response deadlines |
| F Strategies | imagery, elaboration, semantic clustering, method of loci, retrieval practice with optional 1/3/7-day spaced reviews |

Session protocols (Settings): **COGITO adaptive** (default and recommended: the 12 COGITO tasks with the study's stimulus rules, difficulty adjusted after every response or list and kept across sessions, timed slots that add up to the chosen length, task order rotating and alternating memory/speed), **COGITO faithful** (the study's set sizes, timings and blocks, difficulty fixed by a calibration pre-test), **COGITO-inspired** (all 12 tasks with the study's fixed blocks), **Hybrid** (goal *broad* or *episodic*) and **Classic memory** (original). Sessions save their plan, protocol and time used per part, so an interrupted session resumes where it was. Data moves between devices by exporting a backup and merging it on the other device (no account). The assessment page also has an **untrained transfer battery** (symbol–digit coding, series completion, Corsi span) with its own alternate forms.

Optional overnight recall: at the end of a session you can choose to schedule a recall of that session's material for the next morning (at least 8 h later); nothing is scheduled unless you opt in.

Also: 60-minute default sessions based on the COGITO dose (10/15/20/30/45/60/custom), exercise rotation, an open-ended programme in 30-session cycles (introductory cycle, then continuation cycles), per-exercise adaptive difficulty (one parameter per level step), a fixed assessment battery with 4 alternate forms and exposure control, Encoding Efficiency by exact condition, analytics, history, JSON export/import and CSV reports.

## Code map

- `src/core/` — pure logic: seeded RNG, scoring, signal detection, adaptive rules, level tables, scheduler, drift-free timers, protocol, assessment forms, storage, CSV
- `src/content/` — language banks, stored separately (`words.en.ts`, `words.pt.ts`, `stories.*.ts`), aligned by position and given language-neutral ids
- `src/exercises/` — exercise components and the block runner
- `src/pages/` — dashboard, session, modules, assessment, analytics, history, strategies, settings, about
- `tests/` — scoring, adaptive, scheduling, timers, persistence, localisation, generation, distractors, exposure control

## Limits

Not clinically validated, not a medical device. Adaptive thresholds are engineering defaults. Encoding Efficiency is descriptive. Story auto-scoring is keyword-assisted and confirmed by the user. Assessment forms were assembled by hand and have not been psychometrically equated. No IQ or "brain age" score is computed. COGITO-inspired tasks follow published task descriptions (Schmiedek, Lövdén & Lindenberger, 2010) but are not the original materials or protocol; shorter sessions or fewer sessions give far less practice than COGITO's ~100 one-hour sessions, and the adaptive protocol is a variation of the study, which kept difficulty fixed. Speed tasks assume the tab stays visible (browsers throttle timers in background tabs).
