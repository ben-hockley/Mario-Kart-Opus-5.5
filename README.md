# Kart Racer

A Mario Kart Wii–style kart racer for the browser. The race runs on your PC or TV, and up to four players use their **phones as controllers** over local Wi-Fi. Phones can tilt to steer like the Wii Wheel, or use an on-screen joystick. Keyboard and USB gamepads work too.

The racers are Mario Kart Wii driver models plus eight guests from other games, all from [The Models Resource](https://models.spriters-resource.com/). Karts, tracks, and items are original, low-poly, and generated in code. Sound effects are synthesised with the Web Audio API.

## Quick start

Requires Node.js 20.19 or newer.

```bash
npm install
npm run play        # builds, then starts the server
```

1. On the PC, open **https://localhost:5173** in Chrome or Edge. The browser will warn about the certificate: choose **Advanced → Proceed**.
2. On each phone (same Wi-Fi network), scan the QR code on the lobby screen and accept the same certificate warning. Then tap **Tap to start** and hold the phone sideways.
3. When Windows asks whether Node.js may use the network, allow it on **private networks**. Otherwise phones can't connect.
4. Click the game screen once, or press any key, so the browser allows sound.

For development with hot reload, use `npm run dev` instead.

### Why HTTPS?

Phones only give web pages access to the motion sensors (tilt steering) over HTTPS. The server creates a self-signed certificate on first run and saves it in `server/.cert/`. That's why each device shows a one-time warning. If your PC's IP address changes, a new certificate is made and phones need to accept it again.

## Controls

| Action | Phone (tilt) | Phone (touch) | Keyboard | Gamepad |
| --- | --- | --- | --- | --- |
| Steer | Tilt the phone like a wheel | Drag on the left half | A/D or ←/→ | Left stick / D-pad |
| Accelerate | GAS | GAS | W or ↑ | A or RT |
| Brake / reverse | BRAKE | BRAKE | S or ↓ | B or LT |
| Hop / drift | Hold DRIFT and steer | Hold DRIFT and steer | Space / Shift | RB or X |
| Trick (in the air off a ramp) | DRIFT, or flick the phone | DRIFT | Space | RB |
| Use item | ITEM | ITEM | E / Ctrl / X | LB or Y |
| Pause | ❚❚ button | ❚❚ button | Esc / P | Start |

- **Drifting:** hold DRIFT while turning. The sparks go from white to blue to orange. Release for a mini-turbo; orange sparks give a longer one.
- **Tricks:** press DRIFT as you leave a ramp for a boost when you land.
- **Start boost:** press GAS just as the "1" appears in the countdown. If you hold it from "3" you'll spin out.
- **Items:** press ITEM to use one. Bananas and shells are held behind you as a shield while you keep ITEM held. Release to throw: shells fly forward and bananas drop behind. Hold BRAKE as you release to throw the other way.
- The phone settings (⚙) let you switch between tilt and touch, change tilt sensitivity, turn on auto-accelerate, set the current angle as straight, or invert tilt.

## What's in the game

- **Modes:** Grand Prix (all four tracks, with 15/12/10… points for 12 racers and a podium at the end) and Versus (one race on any track). AI difficulty can be Easy, Normal, or Hard.
- **Tracks:** Sunny Circuit, Coral Coast (with a jump over a sea cove), Frosty Peaks (a mountain road with an ice patch), and Magma Keep (a castle with a lava jump).
- **Characters:** 18 racers in three weight classes, each trading off speed, acceleration, handling, and weight. AI racers fill the grid up to 12. Character select shows two 3×3 groups, Mario characters on the left and guests from other games on the right, with one row per weight class.

  | | Mario | Guests |
  | --- | --- | --- |
  | Light | Toad, Dry Bones, Shy Guy | Lemming, Sackboy, Cartman |
  | Medium | Mario, Peach, Yoshi | Bart, Gromit, Brian |
  | Heavy | Donkey Kong, Bowser, King Boo | Wallace, Peter, Homer |
- **Items:** Turbo Mushroom, Triple Turbo, Banana, Green Shell, homing Red Shell, and Super Star. The item roulette gives better items to racers further back.
- **Split-screen:** 1 to 4 players on one screen.

## Character models

The driver models in `public/characters/` come from The Models Resource (ripped by its contributors). Most Mario characters are from its [Mario Kart Wii page](https://models.spriters-resource.com/wii/mkwii/). Shy Guy (not a Mario Kart Wii racer) and the guests use the most detailed version of each character on the site:

| Character | Source |
| --- | --- |
| Shy Guy | Super Mario Party (Switch) |
| Bart, Homer | The Simpsons Game (PS3) |
| Lemming | Lemmings Touch (PS Vita) |
| Sackboy | LittleBigPlanet (PS3) |
| Cartman | South Park: Snow Day! (PC), in his Grand Wizard outfit |
| Gromit, Wallace | Wallace & Gromit: The Big Fix Up (mobile) |
| Brian | Family Guy: Back to the Multiverse (PC) |
| Peter | Warped Kart Racers (mobile) |

The asset pages are listed in `scripts/fetch-characters.ts`. To download the models again, for example after deleting the folder, run:

```bash
npm run fetch-characters
```

The game loads every model (Collada `.dae` or `.obj`) when it starts, bends it into a seated driving pose, and scales each driver to fit the kart for their weight class. The Mario Kart Wii models share a skeleton that is posed directly. The other models have no skeleton, or one that can't be used, so the game builds a simple one for each from the joint positions listed in `src/game/kart/characterModels.ts`. If you swap in a different model, adjust that character's `rig` joint positions there.

The characters belong to their owners (Nintendo, 20th Television, Sony, Aardman, Comedy Central and Paramount). These models are fan-ripped game assets, not free-licensed ones, so keep this project personal and non-commercial.

## Troubleshooting

- **The phone can't load the page:** make sure it's on the same Wi-Fi as the PC and that Windows Firewall allows Node.js. If the PC has several network adapters, the lobby lists other addresses to try.
- **Tilt doesn't work:** on iPhone, allow motion access when asked. If the browser blocks the sensors, the controller switches to touch steering automatically. You can change this in ⚙.
- **Steering is reversed:** turn on **Invert tilt** in ⚙.
- **A phone disconnected:** reopen the controller page. It gets its old player slot back automatically.

## Project layout

```
server/            HTTPS server, self-signed certificate, WebSocket relay (game <-> phones)
src/shared/        Message protocol shared by the server, game and controller
src/controller/    Phone controller page (tilt, touch joystick, menus)
src/game/
  track/           Spline tracks, track-space queries, mesh + scenery generation, track data
  kart/            Arcade kart physics (drift, tricks, hits), kart model, and character model loading
  items/           Item boxes, roulette, bananas and shells
  ai/              AI drivers (racing line, drifting, item tactics, rubber-banding)
  race/            Race manager: grid, countdown, laps, positions, collisions, effects
  render/          Split-screen renderer, chase camera, particles, sky, textures
  ui/, states/     HUD, minimap and menu screens
  audio/           Synthesised sound effects
public/characters/ Driver models (.dae or .obj + textures), one folder per character
scripts/          fetch-characters.ts: downloads the driver models
```

Debug URL options for the game page: `?quick=<track 0-3>` starts a race straight away with keyboard control. You can add `&players=<1-4>` for split-screen, `&auto=1` to let the AI drive, and `&speed=<n>` to run the simulation faster.
