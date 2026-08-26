# Drop-in art

Drop generated images here under their manifest paths and they appear in the
game on the next build — no code changes:

- `cards/<cardId>.png`      — 768×920, the card's art window (top 60% of the 2:3 card)
- `ships/<shipId>/hero.png` — 1024×1024, the ship hero (draft pick, result reveal)
- `ui/menu-bg.jpg`          — 1920×1080, the main-menu backdrop

`GEMINI_ASSETS.md` at the repo root is the full worklist: exact filenames,
dimensions, and ready-to-paste generation prompts. Anything absent falls back
to the procedural treatment, so a half-finished set never breaks a screen.

Licence rule unchanged: every file dropped here must be original generated
work or carry a verified licence recorded in ASSETS_CREDITS.md.
