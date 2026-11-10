# Conflict triage — Four Seasons Hotel San Francisco

Method: **atomic** (locked after smoke). Model proxy: GPT-5.6 + web search. Gemini union applied to the building contradict.

| Topic | SoT | Model answer | Contradicting sources (domain+path) | Run |
| --- | --- | --- | --- | --- |
| Building configuration | The hotel occupies 12 floors within a 42-storey tower. | First-party FS says 12 floors in a 42-storey tower; many skyscraper DBs, trade press and condo listings report ~40 (or 37–39) physical floors for the same tower. | https://en.wikipedia.org/wiki/Four_Seasons_Hotel,_San_Francisco<br>https://www.skydb.net/building/865209581/four-seasons-hotel-san-francisco/<br>https://www.skyscrapercentre.com/building/four-seasons-hotel-residences/15324<br>https://www.skyscrapercenter.com/building/four-seasons-hotel-residences/15324<br>https://www.hospitalitynet.org/news/4009368/four-seasons-hotel-san-francisco-opens-october-3-2001<br>https://structurae.net/en/structures/four-seasons-hotel-2001-san-francisco<br>https://skyscraperpage.com/b1329/san-francisco/four-seasons-hotel-and-residences<br>https://archive.hotelbusiness.com/four-seasons-returns-to-san-francisco/<br>https://rises.co/developments/four-seasons-hotel-residences<br>https://sogood4u.de/cities/san-francisco/four-seasons-hotel-san-francisco/<br>https://www.sanfranciscocondomarket.com/news/four-seasons-residences-2026-year-to-date-sales-review/<br>https://www.rubyhome.com/san-francisco-ca/four-seasons-residences/<br>https://www.houzeo.com/buildings/765-market-st-san-francisco-ca-94103/hzid_1a8aadf9<br>https://www.homes.com/building/four-season-residences-san-francisco-ca/b-3h7tgqjx6rnex/<br>https://therealdeal.com/san-francisco/2022/07/18/double-vision-on-penthouse-listing-at-sfs-four-seasons-residences/<br>https://latecheckout.travel/residences/four-seasons-private-residences-san-francisco<br>https://www.compass.com/homedetails/765-Market-St-Unit-25D-San-Francisco-CA-94103/1OXIIB_pid/<br>https://www.compass.com/homedetails/765-Market-St-Unit-32H-San-Francisco-CA-94103/2090878338164361737_lid/<br>http://www.seismicdesignconsultants.com/examples.html<br>https://aroundus.com/p/5518815-four-seasons-hotel-building-san-francisco<br>https://exa.ai/library/organization/vhprfdp5ymn<br>https://www.oyster.com/san-francisco/hotels/four-seasons-hotel-san-francisco/ | smoke + gemini-union |
| Private dining rooms | MKT Restaurant & Bar has four private dining rooms. | Search identifies three named physical rooms (Windows, View, Vista); Trio is a combined config, not a fourth room. | https://www.fourseasons.com/sanfrancisco/dining/private_dining/<br>https://www.opentable.com/mkt-restaurant-and-bar<br>https://www.businessclass.com/en-us/hotel/review/Four-Seasons-Hotel-San-Francisco | scale |

## Suggested actions

1. **Building configuration (40 vs 42 storeys)** — FS first-party matches SoT (42). Large third-party / DB / condo long tail says ~40. Either document the skipped-floor numbering story and leave SoT, or align public copy; Wikipedia and skyscraper DBs are the highest-leverage corrections if you want the web to converge.
2. **MKT private dining rooms (3 vs 4)** — first-party private-dining page already supports “three.” Likely SoT correction rather than CMS fix.

## Coverage

- Smoke: Hotel Overview + Contact (12 facts) — method gate → atomic
- Scale: Dining + Spa (8 facts)
- Gemini union: building contradict only (`scale/results/gemini-union-building-config.json`)
