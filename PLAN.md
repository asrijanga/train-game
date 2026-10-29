# Inkwell Railways — a hand-drawn railway sandbox

A relaxing, unlimited-resources railway builder in the spirit of Railroad Tycoon,
rendered in Three.js with an ink-and-watercolour, hand-drawn look. Built for an
iPad Pro 13" in Safari (touch first), hosted as a static site on GitHub Pages.

## Pillars

1. **Calm** – no money, no failure states, no timers. Build, watch, unwind.
2. **Hand-drawn** – ink outlines, paper grain, hatched shadows, toon colour bands,
   handwritten labels and sketchy UI.
3. **Detail everywhere** – animated valve gear on steam engines, smoke, lit windows
   at night, boats, birds, windmills, passengers on platforms.
4. **Always playable** – every commit on the branch deploys a working game.

## Technical shape

- Vite + Three.js (ES modules), no backend. `base: './'` so it runs from any path.
- GitHub Actions workflow builds `dist/` and deploys to GitHub Pages.
- Procedural, seeded world (heightmap + biomes + scenery). Saved to `localStorage`.
- Rail network is a graph: nodes with a tangent direction and two "sides",
  edges are dense polylines (x, y, z) produced from arcs/Béziers drawn by finger.
- Custom post-process pass for ink lines (depth + normal edges), hatching, paper.

## Controls (iPad)

| Mode    | One finger              | Two fingers                     |
|---------|-------------------------|---------------------------------|
| Explore | pan / tap to inspect    | pinch zoom, twist rotate, drag tilt |
| Track   | draw track              | navigate                         |
| Station | tap track to place      | navigate                         |
| Train   | tap stations for route  | navigate                         |
| Remove  | tap track/station/train | navigate                         |

Mouse/trackpad fallback: left drag pan (or draw), right drag rotate/tilt, wheel zoom.

## Stories

Each story is shippable on its own. MVP = stories 1–7.

### Epic A — Foundation (MVP)

**S1. Project skeleton & deploy**
_As a player I can open the GitHub Pages URL on my iPad and see the game load._
- Vite project, Three.js renderer full-screen, safe-area aware, no page zoom/scroll.
- GitHub Pages workflow (build + deploy), PWA meta for home-screen full-screen.
- Hand-drawn loading card.

**S2. A world worth looking at**
_As a player I see a procedurally generated island with sea, beaches, meadows,
forests, lakes, a river and snowy mountains._
- Seeded simplex noise, domain-warped fBm, ridged mountains, carved river, lakes.
- Vertex-coloured toon terrain with brush-like colour variation.
- Stylised animated water with shoreline foam.

**S3. Fingers on the map**
_As a player I pan with one finger, pinch to zoom, twist to rotate and two-finger
drag to tilt, with soft inertia; it never fights me._
- Pointer-event gesture recogniser, camera rig with bounds and smoothing.
- Ground picking via heightmap ray-march.

**S4. Lay track by drawing**
_As a player I draw a railway with my finger; it becomes smooth, gently curving
track that respects a minimum radius, snaps to existing track ends and can branch
off existing track to make junctions._
- Arc-chained drawing with clamped curvature, Bézier joins for snapping.
- Live preview (ink pencil line; red when invalid).
- Track meshes: ballast, sleepers, rails.
- Vertical profile: smoothing + grade limit; embankments & cuttings deform terrain;
  bridges over water/valleys; tunnels through hills with portals; trees cleared.

**S5. Stations**
_As a player I tap track to place a station; its style matches its surroundings._
- Platform extruded along the track on the tapped side.
- Station styles: country halt, village station, lakeside, alpine lodge,
  forest lumber halt, grand terminal (chosen by biome, can be cycled).
- Hand-lettered station name labels.

**S6. Trains that run**
_As a player I create a train, choose its engine and carriages, tap the stations
it should visit, and watch it run forever between them._
- Directional rail graph pathfinding (no reversing at switches, reversing at
  stations and dead ends).
- Smooth acceleration/braking, dwell at stations, bogie-accurate car placement.

**S7. Save, undo & remove**
_As a player my railway survives a reload, I can undo mistakes and remove pieces._
- Autosave to localStorage, undo stack, bulldozer tool, new-world button.

### Epic B — Hand-drawn & epic

**S8. Ink & paper rendering** – depth/normal ink outlines with wobble, hatched
shadows, paper grain, watercolour sky and horizon fade, shadow maps.

**S9. Locomotives with soul** – steam Pacific with animated rods & valve gear,
American 4-4-0 with balloon stack & cowcatcher, tank engine, streamlined diesel,
electric express; coaches, dining car, freight (logs, coal, tanks, boxcars),
caboose. Smoke & steam puffs, liveries.

**S10. Living scenery** – multiple tree species with sway, rocks, flowers, grass
tufts, villages with houses/church/windmill, farm fields, fences, sailing boats,
bird flocks, drifting clouds.

**S11. Day & night** – sun/moon arc, sky colours, lit windows and street lamps,
train headlights, stars; settings to pause time.

### Epic C — Life & comfort

**S12. Sound** – procedural ambience (wind, birds, water), chuffs, whistles,
station bells and a gentle generative music bed. Starts on first touch (Safari).

**S13. Passengers & towns** – people wait on platforms and board, towns grow a
little when served, cargo visibly loaded at lumber/mine stations.

**S14. Signals & safety** – edge reservation so trains wait for each other;
semaphore signals animate; deadlock-free fallback.

**S15. Camera joy** – follow-train chase cam, cab ride, photo mode (hide UI).

**S16. Polish & performance** – instancing everywhere, adaptive resolution for
iPad, onboarding hints, settings panel.

## Definition of done (per story)

- Builds with `npm run build`, loads with no console errors.
- Verified in headless Chromium (touch emulation, iPad Pro 13" viewport 1376×1032).
- Committed and pushed so Pages redeploys.
