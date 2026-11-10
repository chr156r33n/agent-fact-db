# Four Seasons Hotel Chicago — listing audit

Slug: `chicago`  
Site: https://www.fourseasons.com/chicago/  
Press facts: https://press.fourseasons.com/chicago/hotel-facts/  
Yext hotel id: `CFS1`  
Fact DB list: `b90d7563-e049-4f44-b37d-838d1bbbd599`  
Audited: 2026-11-10

## Checklist

- [x] 1. Resolve Fact DB list_id
- [x] 2. Pages assigned at seed import
- [x] 3. Load facts (include_unapproved — all pending)
- [x] 4. Map Yext hotel CFS1
- [x] 5. Pull GBP (DataForSEO my_business_info live)
- [ ] 6. Fetch first-party dining / spa detail pages (deferred)
- [x] 7. Compare NAP
- [x] 8. record_source_finding
- [x] 9. propose_fact for telephone gap
- [ ] 10. Flag duplicates (none found)
- [x] 11. Summarise

## Matches

| Topic | Surface | Notes |
| --- | --- | --- |
| Property name | Yext CFS1 | Four Seasons Hotel Chicago |
| Address | Yext CFS1 | 120 East Delaware Place, Chicago, IL 60611 |
| Address | GBP | 120 E Delaware Pl, Chicago, IL 60611 |
| Website | Yext + GBP | fourseasons.com/chicago |

## Contradictions

_None on hotel NAP._ ZIP+4 on press SoT (`60611-1443`) vs listings (`60611`) — treat as format variance, not a conflict.

## Pending human actions

1. Accept/correct pending Chicago seed facts (15 + telephone propose).
2. Confirm telephone claim proposed from Yext/GBP (`+1 312 280 8800`).
3. Optional: map dining entities (Adorn / CFS2+) and spa listing in a follow-up pass.

## Notes

GBP phone `+1312-280-8800` and Yext `+13122808800` agree. Hotel rating on GBP: 5. Follow `.cursor/skills/property-fact-audit/SKILL.md` for F&B depth.
