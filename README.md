# Monster Shadow Theatre

Four drawn monsters that behave like **shadow puppets on strings**, hanging in front of
your webcam image. Each one is a **rigged 2D character** — bones, a skinned mesh, a
blinking face and a tail — that reacts to gestures picked up by the camera.

![monsters](assets/monster1.png)

## Run it

No build step, no dependencies — it is plain HTML, CSS and ES modules.

```bash
npm start                     # python3 -m http.server 8000 --bind 0.0.0.0
# or
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

> The camera needs a secure context: `localhost` works, and any HTTPS host works.
> Serving over plain HTTP from another machine will block `getUserMedia`.

## What you can do

| Gesture | Result |
| --- | --- |
| Move your hand (or the cursor) | Nearby monsters turn their heads to watch it |
| Open hand + wave | The nearest monster waves back and grins |
| Pinch in the air | Grab that monster; it reaches, flails and swings while held |
| Drag with mouse / finger | Move a monster — it lags and swings behind your hand |
| Fling and let go | Momentum is thrown into the string, so it wobbles and settles |
| Scroll / trackpad | Resize the monster under the cursor |
| Double-tap / double-click | Spin it on its strings |
| Two hands near the stage | Everyone gets excited: faster tails, wider eyes, chattier jaws |
| **Shadow / Spirit** | Switch between black silhouettes and the painted artwork |
| **Reset** | Send every monster back to its mark |
| Keys | `C` camera · `H` hands · `S` shadow/spirit · `M` sound · `R` reset · `Esc` dismiss intro |

## How the characters are rigged

The drawings are not cut into pieces. Each one is a **triangle mesh** (a 34 x 46 grid
over the artwork) bound to a **bone skeleton** — root, spine, chest, neck, head, eyes,
jaw, two arms with forearms, two legs with shins and a four-bone tail.

* **Skinning.** Bones compete for every vertex by distance: a vertex is shared between
  the bones that are nearly as close to it as the closest one (so a big head bone owns
  the ears without dragging the belly). The weights are then smoothed over the mesh,
  which is what stops the skin from tearing when a bone swings far.
* **Deformation.** Poses are applied on the CPU (`solve()` → `skin()`) and uploaded to
  WebGL every frame; the mesh is drawn with the artwork as a texture, or as flat black
  for the shadow look.
* **Performance.** ~1.6k vertices, 20 bones, four characters, one draw call each — the
  pose and skinning cost well under a millisecond per monster.

## How the puppet feel works

Each monster has two points: a **grip** (where your hand holds it) and a **body** that
chases the grip through a damped spring. The body therefore trails the grip, and that
trail is converted into tilt around the grip, so the creature hangs, swings and settles
like paper on strings. A small idle sway keeps the stage alive when nobody is holding
anything.

Grabbing uses per-pixel alpha testing (an offscreen mask per image), so you only pick a
monster up when you actually touch the drawing, not its transparent bounding box.

## Files

```
index.html        stage, HUD, intro
css/style.css     lamp, grain, vignette, puppet layers, UI
js/main.js        loop, input, gestures → puppets, UI wiring
js/puppet.js      spring physics, render transform, alpha hit-test (also the no-WebGL fallback)
js/rig.js         mesh + bone rig, skin weights, pose solve, WebGL renderer
js/rigs.js        per-monster skeletons traced from the drawings
js/rig-puppet.js  procedural performance: breathing, head tracking, waves, tail, blinks
js/camera.js      webcam + MediaPipe hands + pinch / open-hand / wave detection
js/audio.js       tiny synthesised grab / pluck / spin sounds
assets/           the four drawings
```

Hand tracking is optional and loaded on demand from a CDN (MediaPipe Tasks Vision); it
needs an internet connection the first time and falls back to mouse/touch dragging if it
cannot load. Video frames never leave the browser — they are only painted on this page.
