# Inkwell Railways

A calm, cozy, painterly railway builder in Three.js, in the same art style as [Garden](https://asrijanga.github.io/garden-game/). You get unlimited track on a procedurally generated island. Built for iPad Pro in Safari, and it also works with a mouse or trackpad.

### ▶ [Play Inkwell Railways](https://asrijanga.github.io/train-game/)

**Play:** open **https://asrijanga.github.io/train-game/** in Safari. On iPad, *Share → Add to Home Screen* runs it full-screen.

## How to play
- **Track:** draw with one finger. Start on an existing line to branch off it, or finish on one to join it.
- **Station:** tap beside the track. The station's style depends on the land around it, and you can change it from the station's panel.
- **Trains:** tap *New train*, then pick an engine, a livery and carriages. Tap the stations in the order the train should visit them, then press *All aboard!*.
- **Explore:** one finger pans, two fingers pan, pinch and twist, three fingers tilt. Tap a train to follow it, ride in its cab or chase it.
- **Camera button:** relax mode hides the interface and tours your railway on its own.
- **Your railway** saves itself automatically. Undo is always available. Settings has the time of day, sound and a new-island option.
- Add `?seed=12345` to the URL to open a specific island.

## Development
```
npm install
npm run dev      # local server
npm run build    # static site in dist/
```
Deploys from `.github/workflows/deploy.yml`. To turn it on, go to *Settings → Pages → Source: GitHub Actions*.
If deploys from this branch are blocked, allow it under *Settings → Environments → github-pages*, or merge it to `main`.

See `PLAN.md` for the stories it was built from.
