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
