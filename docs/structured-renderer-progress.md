# Structured renderer implementation status

Updated: 2026-11-06

## Branch
`feature/structured-race-renderer-v1`

## Implemented
- Initial structured race JSON schema: `schema/race-v1.schema.json`
- Structural validator: `tools/validate-race.mjs`
- Shared HTML renderer: `js/race-renderer.js`
- Archive integration: `index.html` loads the shared renderer and selects it when a race JSON has no legacy `render.html`.
- Dirt race header base color: `#70452F`.
- Four fixed tabs and fixed card positions are rendered from structured data.
- Turf/dirt use the same card layout; the supplied surface-specific data populates the same positions.
- Recent-form collapse control, four-tab switching, comments, and ichioshi emphasis use existing page initialization behavior.

## Tests completed
- The actual local Kiyosato structured JSON v1.1 passed the validator: 14 horses, 3 recent runs per horse, 4 tabs, source provenance.
- Synthetic field sizes 6, 8, 9, 16, 17, and 18 passed the validator.
- A duplicate horse number was rejected.
- Renderer JavaScript syntax check passed.
- Renderer smoke tests passed for 6-horse turf, 14-horse dirt, and 18-horse turf fixtures: expected horse-card, tab, and recent-run counts were generated.
- HTML escaping smoke test passed.

## Not yet verified
- Pixel/visual comparison against the locked Tokyo 9R layout in a real browser.
- End-to-end loading of the actual 14-horse JSON through the GitHub Pages archive.
- Turf and dirt DATE 2 source-field completeness across multiple races.
- Performance timings against the legacy renderer.
- TARGET pedigree/source color preservation: the current structured sample does not contain pedigree source-color metadata, so faithful color reproduction cannot yet be claimed.

## Safety
- This branch is a test implementation only.
- The production `main` branch and live site have not been changed.
- Do not merge or publish until the visual and data-integrity checks above pass.


## TARGET pedigree source-color preservation (2026-11-06)

- Confirmed from the supplied ① TARGET HTML: pedigree cells expose source colors through `BGCOLOR` and `FONT COLOR` attributes.
- The sample race contains three sire-background values (`#00FFFF`, `#FFC0FF`, `#FFFF00`), four damsire-background/line-background values (`#00FF00`, `#00FFFF`, `#FFC0FF`, `#FFFF00`), and dam text color `MAROON`.
- Structured pedigree shape now supports `sireLine`, `damsireLine`, and a `colors` object with source attributes for sire, dam, damsire, sire line, and damsire line.
- Renderer reads literal source color values and applies them directly after a conservative CSS-color syntax check. It does not map colors to semantic categories; new valid source colors are accepted without a hard-coded palette.
- Sample extraction was parsed against all 14 horse rows and matched the horse-number sequence. This confirms extraction structure for this sample; pixel-level visual comparison against the TARGET application is still pending.


## Follow-up hardening (2026-11-06)

- Added `tools/extract-target-pedigree.py`: extracts the five TARGET pedigree cells by horse number, preserves `BGCOLOR` / `FONT COLOR` values verbatim, and can merge them into structured race JSON only after exact horse-count, horse-number, and horse-name matching.
- Tightened the schema and validator: every horse's pedigree now requires the five source fields and five source color slots; valid CSS color values are accepted, as are previously unseen color property names. Inline CSS injection strings are rejected.
- Fixed the validator's date regex and extended checks for distance, horse count, duplicates, ordering, comments, four-tab shape, and pedigree color validity.
- Renderer now displays only the approved pedigree items (sire, dam, damsire); the two source family-line cells and their colors remain stored for provenance but are not added as extra display chips.
- Renderer applies the existing index-color bands (80–89 green, 90–94 `#F4A09A`, 95+ pink), the summary red/blue highlight thresholds, and recent-run body-weight change.
- The shared gray-background normalizer now skips all nodes within `.pedigree-inline`, so even a future gray-like TARGET pedigree color cannot be stripped.
- Local checks: 14/14 name+pedigree text and source-color comparison PASS; merged JSON schema validation PASS; validator PASS at 6, 8, 9, 14, 16, 17, 18 horses; duplicate-number rejection PASS; new CSS color and unknown color-key acceptance PASS; invalid CSS injection rejection PASS.
- Still pending: visual browser comparison against the locked Tokyo 9R baseline, full browser archive-to-detail integration with the 14-horse sample, and validation of the extraction mapping against separate turf and dirt TARGET exports. Main/live remain untouched.


## Source-style fidelity and browser smoke checks (2026-11-06)

- Expanded extraction from a single assumed color per pedigree field to `pedigree.sourceStyles`: for each of the five TARGET pedigree cells (sire, dam, damsire, sire-line, damsire-line), preserve both `BGCOLOR` as `backgroundColor` and `FONT COLOR` as `textColor`, including null when the source has no attribute.
- The compact `pedigree.colors` compatibility fields remain available; the renderer prefers the complete `sourceStyles` values for the three visible ancestry items.
- The renderer applies both source background and text colors to the visible source fields, accepts new standard CSS color values, and safely ignores invalid CSS strings. Family-line names/colors remain stored but are not rendered as extra chips, consistent with the locked three-item pedigree layout.
- The TARGET extraction tool supports UTF-8 and Shift-JIS/CP932, checks consecutive horse numbers, checks exact horse names during merge, and writes source provenance into `sourceAudit`.
- Full-source comparison: 14 horses × five pedigree cells × two style attributes = 140 attribute comparisons; zero mismatches. UTF-8 and Shift-JIS extraction outputs were identical.
- Synthetic forward-compatibility test: previously unseen color values (`rebeccapurple`, `navy`, `#123456`) and extra foreground/background attributes were extracted, schema-validated, and rendered without palette substitution.
- Browser smoke harness (isolated renderer + current archive tab/collapse/back handlers): 14 cards, 56 tabs, 70 summary chips; tabs switch; recent-form block collapses/expands; back-to-list works; pedigree gray-like source color survives normalization while an ordinary gray target is stripped; no page errors or horizontal overflow at 390px and 1280px.
- This browser run is an isolated harness, not a pixel-perfect comparison or full GitHub Pages archive-to-JSON integration test. That comparison remains outstanding.


## 90-cell source-style integration pass (2026-11-06)

- Re-checked the supplied TARGET export independently: 14 horse rows, exactly 90 cells per row (profile 7 + recent runs 3 × 26 + pedigree 5). Horse number and horse name align 14/14 with the structured sample.
- Source style attributes found in the 1,260 cells: 195 background attributes and 347 text-color attributes. These are retained as source values; no semantic color mapping is performed.
- Extractor mapping covers all 90 source cells: profile (7), three recent runs (26 each, including four passing-order cells), pedigree (5). The local merge fixture passed slot-count and horse-name checks for all 14 horses.
- Schema now explicitly describes root `horse.sourceStyles.profile` and three `horse.sourceStyles.recentRuns` style maps, in addition to pedigree styles. Validator now checks those fields and color values.
- Renderer now applies source foreground/background styles to profile fields and visible recent-run fields. For index backgrounds, non-gray source colors take priority; if the source background is gray and the locked gray-normalization rule removes it, the score band is used as the fallback. Pedigree source colors remain exempt from gray normalization.
- Latest renderer JavaScript syntax check: PASS. Dynamic render smoke tests: 6, 8, 9, 14, 16, 17, and 18 horses; all produced the expected number of horse cards, 3 recent runs per horse, and 4 tabs per horse. XSS escaping check also passed in the earlier harness.
- Validator module syntax check: PASS after fixing callback control flow. JSON schema parse check: PASS.
- End-to-end extractor test now completed locally against the supplied Shift-JIS TARGET HTML and the 14-horse structured JSON: PASS, 14 horses × 90 cells, exact horse-number/name matching, source style merge. This test used a local copy of the committed extractor logic; the target repository branch still does not contain the merged fixture JSON.
- Still pending: run the committed validator against the fully merged fixture using the repository's exact schema, verify separate turf and dirt TARGET exports, commit a source-styled sample fixture to the test branch if appropriate, and complete browser visual comparison with the locked Tokyo 9R layout. Main/live remain untouched.

- Additional verification: latest renderer syntax and dynamic render tests PASS for 6/8/9/14/16/17/18 horses; latest validator module syntax PASS; schema JSON parse PASS. The gray-color fallback precedence change was included in those renderer tests.

- Validator execution check: a six-horse synthetic fixture with the complete 90-cell style structure passed the current validator logic (5 summary slots, 4 tabs, 3 recent runs, pedigree and root source styles). This confirms validator behavior on the new shape, but the exact 14-horse merged sample has not yet been passed through the repository validator binary.
