# DriveFlow V6 — Release gates

`main` remains production V5 until every blocking gate below passes.

## Blocking gates

- [x] Latest real V5 backup passes privacy-safe audit and V5→V6 migration count checks. *(Validated privately; no personal backup committed.)*
- [x] No loss of sessions, Uber rows, Deliveroo rows, cash tips, savings overrides or existing record classifications during migration.
- [x] Official imported revenue is preserved even when an order is not classified to a session.
- [ ] Session create/edit/delete, pauses, odometers and 30-minute separation work on a real iPhone.
- [ ] Uber snapshot import, Deliveroo upsert, historical CSV import, backup export and restore are tested on-device.
- [ ] Split V6 persistence survives force-close/reopen and does not rewrite unrelated large data blocks.
- [ ] Service-worker update from V5→V6 is tested without clearing user data.
- [ ] Standalone PWA cold start/resume, scrolling and no-zoom gesture behavior are tested on iOS.
- [ ] Weekly savings overrides are isolated by week and historical V5 daily overrides remain readable.
- [ ] URSSAF enable/disable and effective dates never alter periods before their effective start.
- [x] Weekly planner never selects overlapping sessions and exposes uncertainty/probabilities.
- [x] Adaptive Intelligence lookback uses 3 months first and expands to 6/12 months only when needed.
- [x] Historical weather enrichment completes on the real dataset. *(Validated privately from the supplied Open-Meteo export.)*
- [x] Weather passes the configured walk-forward ablation gate: MAE improvement exceeds the 1.5% threshold and remains positive in both validation halves. *(Exact private metrics are not committed.)*
- [x] Montpellier Gazole history is generated from official annual archives; the derived daily series is populated and an automated refresh workflow is in place.
- [ ] CI is green on the final release candidate commit.

## Non-blocking / post-V6 candidates

- Cloud accounts / Supabase sync.
- IndexedDB migration if split localStorage is no longer sufficient.
- External event/traffic/promotions context after proving incremental predictive value.
- Native Capacitor packaging.

## Production merge rule

Do not merge draft PR #1 until all blocking gates are checked or an explicit documented decision accepts a remaining limitation.
