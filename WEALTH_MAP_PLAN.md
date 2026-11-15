# Wealth Atlas

## Working demo

Route: `/wealth-map`. Static Next.js export on the existing S3/CloudFront site. Leaflet renders vector shapes without commercial map tiles or a new server. No subscription or paid data API is introduced; existing hosting and bandwidth costs remain.

The checked-in snapshot contains 2024 World Bank GDP/person at PPP, Natural Earth country polygons, and 330,669 ACS areas across 52 state/territory files. U.S. boundaries adapt from states (zoom 4) to counties (5), tracts (7), and block groups (10). Census TIGERweb 2024 supplies matching boundaries. A cached San Francisco-area boundary snapshot supports the initial view without that service. The U.S. income files load only for requested states; boundary responses are cached in a bounded session cache. Outside the U.S., resolution remains countries. Zooming does not invent additional data.

## Definitions

- U.S. observations: ACS 2020–2024 per-capita income, B19301, annual 2024 USD, with published 90% margins of error. Block groups are the finest geography available for this table, not individual properties or households.
- Country observations: World Bank 2024 `NY.GDP.PCAP.PP.CD`, GDP per person in current international dollars. Country output is not household income or net worth.
- Fixed global proxy: country GDP/person divided by world GDP/person. For a U.S. area, multiply the U.S. country proxy by local ACS income divided by national ACS income. This bridge is illustrative, not a validated estimate of local GDP or comparable global wealth.
- Relative proxy: divide by the unweighted median proxy of currently visible areas, using polygon bounding-box intersection with the viewport. Each area counts once; this is not a population percentile or a median person's income. U.S. country polygons are omitted when U.S. detail loads, preventing national/local double counting.
- Seven logarithmic color bins span 0.125–8 times the selected reference. Outside values saturate. Missing/suppressed values remain gray and do not enter the median. Large MOEs are surfaced on selection.

No composite property/income score is used yet: asset prices, household income, and output have incompatible units and coverage. A more complex formula would imply unsupported precision.

## Reproducibility and operations

Run `python scripts/wealth-map/refresh.py` to refresh snapshots using Python's standard library, then `node scripts/wealth-map/check.cjs` and `npm run build`. Refresh is an intentional offline step, not a billable scheduled job. The script uses no API keys. `public/wealth-data/meta.json` records source URLs and retrieval time. Census data are federal public data; Natural Earth is public domain; World Bank data are attributed under its open-data terms (CC BY 4.0). Leaflet is BSD-2-Clause.

Runtime boundary failures show an explicit country-level fallback and Retry. No partial/truncated high-resolution response is presented as a complete local comparison. Paging is capped at 10,000 features and asks the visitor to zoom in if exceeded. Existing admin and Firestore policies are unchanged.

## Next steps, in cost order

1. Measure usage before adding infrastructure. Keep snapshots versioned and manually refresh annually; check schema, missing coverage, geometry joins, and source license changes before publishing.
2. For reliability at higher traffic, precompute simplified county partitions or PMTiles on the existing object store, eliminating runtime TIGERweb dependency. Benchmark compressed transfer, cache headers, mobile memory, and viewport panning. Do not download the full nationwide geometry on every visit.
3. Add separately selectable ACS median household income, home values, and poverty tables, retaining MOEs and definitions. Property values are an asset proxy, not net worth; do not silently blend them into the income layer.
4. Add country-specific public small-area sources (for example UK statistical areas and Canadian dissemination areas), with source-year badges and currency/PPP methodology. Show coverage explicitly. Global micro-area coverage is not currently delivered.
5. Evaluate open modeled relative-wealth grids only after checking licensing, dates, coverage and validation. Keep modeled estimates visibly separate from official observations. A shared global scale requires defensible harmonization, not simply recoloring country-relative ranks.

## Validation scope

Automated checks cover scale invariants, missing values, the U.S./world bridge, duplicate geometry, and cached boundary-to-income joins (one explicitly checked unmatched Alameda County block group remains gray). Browser checks cover loading, global/relative modes, map selection, navigation, data-source disclosure, and responsive layout. Production deployment must be verified separately from the local build. No authorization changes require emulator testing for this feature.
