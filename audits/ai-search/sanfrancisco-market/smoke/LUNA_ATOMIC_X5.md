# Luna atomic ×5 (medium effort)

`gpt-5.6-luna`, 12 smoke facts × 5 trials = **60** calls. Checkpoint/resume used after network flake.

| Metric | Value |
| --- | ---: |
| Total tokens | 709 067 |
| Search rounds | 68 |
| Wall | ~8.6 min |
| Est. $ (Luna rates + search) | **~$0.85** |
| Stable facts | 11 / 12 |
| Ever-contradicts | 1 |

## Stability

| Fact | Majority | Stability | Contradict rate | Ever contradicts | Union sources |
| --- | --- | ---: | ---: | --- | ---: |
| MKT reservations telephone | matches | 40% | 40% | yes | 1 |
| All other 11 | matches | 100% | 0% | no | 0 |

**MKT reservations (`+1 415 633 3838`):** trials split `matches×2 / contradicts×2 / unclear×1`. Contradicting source: first-party MKT page listing `+1 415 633 3000` for reservations (contact page still has 3838).

## vs single-shot Luna atomic

| Fact | Single-shot | ×5 |
| --- | --- | --- |
| Equinox Sports Club & Spa telephone (`3990` vs `3900`) | contradicts (14 sources) | **stable matches (0/5)** — single-shot false alarm |
| MKT reservations telephone | matches | **unstable; ever_contradicts 40%** — single-shot miss |

## Takeaway

Repetition changes the picture: don’t trust one-shot contradicts or one-shot matches for phones. Use `ever_contradicts` + unioned sources after ≥5 trials as the ops signal; majority alone would have buried the MKT conflict.
