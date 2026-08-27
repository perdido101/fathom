# Drop music here

One file per track, named for its id, `.mp3` or `.ogg`:

    battle.mp3  menu.mp3  draft.mp3  deploy.mp3
    bracket.mp3  victory.mp3  defeat.mp3  champion.mp3

The prompts, target lengths and file-size ceilings are in `MUSIC_BRIEF.md` at
the repository root, generated from `src/ui/music/MusicManager.ts` so the two
cannot disagree.

**A file that is here plays. A file that is not here is silence.** Nothing
else needs changing — no registration, no code, no build flag. This is the
same contract `src/art/` has for illustration, for the same reason: the person
making the assets should never have to touch the game to drop one in.

Anything in this folder ships in the bundle, so mind the per-track ceilings in
the brief. The whole set is budgeted at about 10 MB.
