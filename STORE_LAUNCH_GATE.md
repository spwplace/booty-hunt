# Booty Hunt Store Launch Gate

Last updated: 2026-02-07

## Release Rule
- `NO-GO` if any `P0` item is not `PASS`.
- `NO-GO` if more than two `P1` items are not `PASS`.
- Store listing only begins after all `P0` are `PASS`.

## Gate Checklist

| Priority | Gate | Pass Criteria | Current Status | Evidence |
|---|---|---|---|---|
| P0 | Scope lock vs design roadmap | Launch scope is explicitly frozen, with no milestone marked in progress for launch branch | FAIL | `src/V2Roadmap.md:29`, `src/V2Roadmap.md:33` |
| P0 | Core content floor | Event deck meets launch floor (40+ authored cards) and cross-reference checks pass | FAIL | `src/V2Roadmap.md:30`, `design-docs/10-V2-Design-Plan.md:432` |
| P0 | Shipping build integrity | `npm run build` passes in CI and locally on clean checkout | PASS | `package.json:8` |
| P0 | Production-only surface control | Dev panel, editor mode, and telemetry export are inaccessible in release builds by default | PASS | `src/main.ts:61`, `src/main.ts:2863`, `src/main.ts:5104` |
| P0 | New-player onboarding correctness | Tutorial only appears for first-time players unless explicitly reset | PASS | `src/main.ts:3111`, `src/main.ts:4876`, `src/Progression.ts:963` |
| P1 | Accessibility launch baseline | Rebinds, effect intensity controls, text scale, and colorblind options implemented and tested | FAIL | `design-docs/10-V2-Design-Plan.md:289`, `design-docs/10-V2-Design-Plan.md:290`, `design-docs/10-V2-Design-Plan.md:291` |
| P1 | Save-and-resume run state | Mid-run save/resume works and survives reload/crash | FAIL | `design-docs/10-V2-Design-Plan.md:292` |
| P1 | Test automation | Automated tests exist for progression, save/load migration, and run-complete critical path | FAIL | `package.json:6` |
| P1 | CI release gates | CI blocks deploy on test/lint/build failures | FAIL | `.github/workflows/deploy.yml:31` |
| P1 | Performance budget | Meets target frame budgets on defined desktop/mobile targets | FAIL | `design-docs/10-V2-Design-Plan.md:347`, `design-docs/10-V2-Design-Plan.md:348` |
| P1 | Bundle budget | Initial JS payload within agreed launch budget or split plan approved | FAIL | build output warning: `dist/assets/index-DGRQQqU_.js` (~858 kB) |
| P1 | Store operations pack | Privacy policy, support URL, crash-report process, changelog, and versioning policy complete | FAIL | repository currently lacks these store docs/files |
| P2 | Marketing asset pack | Capsule art/screenshots/trailer/description copy in place | FAIL | repository currently lacks store media pack |
| P2 | Post-launch playbook | Patch SLAs, telemetry review cadence, rollback plan documented | FAIL | not yet documented in repo |

## Current Decision
- `NO-GO` for store listing.

## Highest-Impact Fixes Already Landed
- Release feature flags now default-hide dev panel, scenario editor, and telemetry export (`VITE_ENABLE_DEV_PANEL`, `VITE_ENABLE_SCENARIO_EDITOR`, `VITE_ENABLE_TELEMETRY_EXPORT` can re-enable intentionally).
- Tutorial completion now persists to save data and does not replay every run.

## Next Ship-Blocker Work (in order)
1. Freeze launch scope and close `in progress` milestones in `src/V2Roadmap.md`.
2. Expand and validate event content to launch floor.
3. Add automated tests for progression/save/load + wire CI to fail on test failures.
4. Implement minimum accessibility set and save-resume.
5. Set explicit performance and bundle budgets with regression checks.
