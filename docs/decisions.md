# Decisions

Append-only. Newest at the bottom.

## 2026-10-19: spun out of ninja-tasks as its own mod
Jungle mode was built inside ninja-tasks on 2026-10-17 (`6cfce28` there). Mateo asked for it as its own mod, so the engine (`hooks/jungle.ts`, the octant renderer, the rig and build tools) was copied here and the dojo parts left behind. Same reasoning as ninja-tasks' "own plugin" entry: a shared engine only if a third octant mod shows up. Both mods draw in AbovePrompt; run one at a time.

## 2026-10-19: autopilot only, in the 1982 jungle-runner idiom, original art
Carried over from ninja-tasks' 2026-10-17 entry. A flip-screen run, one screen per tool call, the call choosing the hazard, finished tasks as treasure; the hero is driven by `plan()` (breadth-first search over run, wait, jump, swing). No playable mode (all mods are autopilot/idle). Modeled on the Atari 2600 jungle game of 1982 (vines, tar pits, quicksand, rolling logs, crocodile heads, flip screens). Its publisher's copyright on that game runs to about 2077 and its title is a live trademark, so: original screenshots are study material only, kept outside the repo; every pixel here is drawn from scratch; our own seeded screens, not its screen table; and the game's title, its hero's name and the film hero he echoes stay out of every public string, README and commit (the names are listed in the private study notes, not here). Mateo chose reference-and-redraw over private rips on 2026-10-19. Expensive to reverse once published.

## 2026-10-19: the explorer and the banded screen
Hero: our own explorer, a cream wide-brim bush hat, orange shirt, brown pack, dark trousers and boots, drawn by `tools/rig.py`. Each body part is a flat band on whole octant cells (hat y 8-11, face 12-15, shirt 16-23), and the run doesn't bob, because over a full backdrop a cell shows only the sprite's main color plus the scenery's. Screen: flat bands like the 1982 runners, from measurements in `~/second-brain/outputs/2026-10-19-jungle-run-reference-study.md` (canopy with a 4-px stepped edge, light-green jungle, a ground lane the boots land mid-way down, a dirt band, stepped-lens pits, pure-black tar). STAND went from 4 to 8 to put him in the lane, and the "!" moved beside the hat since there's no headroom above it. The vine is drawn full length in a lighter olive so it reads over the canopy. Preview: `art/screens.png`.
