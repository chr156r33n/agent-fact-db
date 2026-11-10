# Four Seasons — Boston — listing audit

Slug: `boston`
Site: https://www.fourseasons.com/boston/
Press facts: https://press.fourseasons.com/boston/hotel-facts/
Yext hotel id: _unknown — resolve via folders / websiteUrl_
Status at scaffold: open

## Checklist

- [ ] 1. Resolve Fact DB list_id
- [ ] 2. list_pages; assign unassigned facts when source_url maps cleanly
- [ ] 3. Load accepted facts (include_unapproved for pending gaps)
- [ ] 4. Map Yext entities (hotel + dining + spa/closed)
- [ ] 5. Pull GBP for hotel and each dining/spa listing
- [ ] 6. Fetch first-party dining / spa / contact pages
- [ ] 7. Compare NAP, hours, categories, website paths
- [ ] 8. record_source_finding (quote + party + verdict)
- [ ] 9. propose_fact for gaps; assess_fact confirm/contest
- [ ] 10. Flag duplicates; dismiss noisy findings
- [ ] 11. Summarise matches, contradictions, pending human actions

## Matches

_None yet._

## Contradictions

_None yet._

## Pending human actions

_None yet._

## Notes

Follow `.cursor/skills/property-fact-audit/SKILL.md`.
When complete, run:

```sh
node scripts/run-listing-audit-batch.mjs --mark-audited boston
```
