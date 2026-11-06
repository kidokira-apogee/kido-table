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
