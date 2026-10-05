# 02 — The SWF extraction pipeline

`npm run extract` turns `AlienTransporter.swf` into everything the game and the agents need. The pipeline is **idempotent**: a repeated run rebuilds only what has changed (by input hashes in `build/extract/.cache.json`). Each step is a separate script in `tools/extract/` and can be run on its own (`npm run extract -- --step=sprites`).

## Prerequisites

- Java 17 (`/opt/homebrew/opt/openjdk@17`), ffmpeg (`/opt/homebrew/bin/ffmpeg`), Node ≥ 22 — already installed on the user's machine.
- `.env`: `ORIGINAL_SWF=/Applications/Flash Games/alien-transporter.swf`. The script copies the SWF to `vendor/original/AlienTransporter.swf` and checks the SHA-256 (recorded on the first run in `tools/extract/swf.sha256`).
- All java invocations run with `-Djava.awt.headless=true`.

## Step 1. JPEXS (`tools/extract/get-jpexs.sh`)

```bash
URL=https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.3.0/ffdec_26.3.0.zip
SHA256=35f4930eb7c380afe66f2117f90b006deac0631473ad7500bb39c78f68645ecd
# download to vendor/jpexs/ffdec.zip, verify with shasum -a 256, unpack into vendor/jpexs/
# CLI: java -jar vendor/jpexs/ffdec-cli.jar ; library: vendor/jpexs/lib/ffdec_lib.jar (+ the other jars in lib/)
```

## Step 2. Decompilation (`decompile.ts`)

```bash
java -Djava.awt.headless=true -jar vendor/jpexs/ffdec-cli.jar \
  -export script,binaryData,symbolClass build/extract/raw vendor/original/AlienTransporter.swf
```
- `build/extract/raw/scripts/**` → `reference/as3/**`: 1119 files, of which `ru/alientransporter` (~22.7K lines), `ru/antkarlov/anthill` (~20K), `Box2D/**` (~14K, for reference), the root `Level*Physic_mc.as`, `*Model_mc.as`, etc.
- `build/extract/raw/binaryData/*.bin` → `reference/data/` with readable names: `missions.xml`, `texts_en.xml`, `effects.xml`, `fonts/font01.xml` … (by the class suffix: `MissionManager_XmlMissions` → `missions.xml`, `Fonts_XmlFont04Blue` → `fonts/font04Blue.xml`).
- Verified: the decompilation is clean, there are no `§§` artifacts. The script must still fail if it finds `§§` in `reference/as3/ru/**`.
- Export the bitmap font images (`Fonts_ImgFont*`, which are `DefineBitsLossless2`) separately: `-export image` → `reference/data/fonts/*.png` (matched via SymbolClass).

## Step 3. `SymbolInfo.java` — symbol bounds, placements, sound

The source is in `tools/extract/java/SymbolInfo.java`. **It has been verified on this SWF.**
```bash
javac -cp "vendor/jpexs/lib/*" -d build/extract/java tools/extract/java/SymbolInfo.java
java -Djava.awt.headless=true -cp "vendor/jpexs/lib/*:build/extract/java" SymbolInfo \
  vendor/original/AlienTransporter.swf build/extract   # → symbols.json, placements.json
```
- `symbols.json`: an array of `{id, className, kind: sprite|shape|image|sound|…, frames?, rect, rectWithFilters, sound?}`. Coordinates in pixels (twips / 20). `sound = {format: 2 (MP3), rate, stereo, sampleCount, seekSamples}`. Verified: all 55 named sounds have `seekSamples = 0`.
- `placements.json`: `{ "<ClassName>": [ {depth, characterId, className|null, instanceName|null, move, matrix:[a,b,c,d,tx,ty]} ] }` — frame 1 of each clip matching the regex `Level\d\dPhysic_mc|.*Model_mc|.*Ragdoll(\d\d)?_mc`. 73 clips in total: 20 levels and 53 models/ragdolls (20 of them are `Passenger<Color>Ragdoll0N_mc`; exactly 53 are registered in `Models.as`). The order is the tag order. **Sort by `depth` before use**, because in AS3 `getChildAt(i)` is the depth order.
- Verified: `Level01Physic_mc` has 189 placements (GroundBox_com 16, GroundCircle_com 18, Station_com 2, Trigger_com 5, etc.). 108 of them have `className = null`: this is unnamed editor artwork that the game ignores.

## Step 4. Sprites (`sprites.ts`)

### 4.1 Export
```bash
for Z in 1 2 3; do
  java -Djava.awt.headless=true -jar vendor/jpexs/ffdec-cli.jar -zoom $Z -format sprite:png \
    -export sprite build/extract/sprites/${Z}x vendor/original/AlienTransporter.swf
done
```
- JPEXS exports all 596 sprites (~47 s at 2x). The folders are named `DefineSprite_<id>_<Class>_<Class>/` or `DefineSprite_<id>/`, the frames are `1.png … N.png`. Match by `<id>` with `symbols.json`.
- **Registration point (verified on all 590 sprites):** JPEXS renders each frame onto a canvas of size `ceil(rectWithFilters · Z)` (±1 px), the top-left corner = `(rectWithFilters.xMin, rectWithFilters.yMin)`. So the origin of a frame (where in the PNG the symbol's (0,0) point lies) = `(−rectWithFilters.xMin · Z, −rectWithFilters.yMin · Z)`. For the 46 sprites with filters `rectWithFilters ≠ rect`; for the others they coincide.

### 4.2 Which symbols we take (a whitelist, assembled automatically)
1. The list of classes from `reference/as3/ru/alientransporter/Assets.as` (`new <Class>[...]`, ~413 names).
2. All string literals `addAnimationFromCache("X"…)` across `reference/as3/ru/**` (146 unique).
3. `<Clip name="X"/>` from the `CacheList` in `reference/data/effects.xml`.
4. String literals of the form `"…_mc"` in `ru/alientransporter/{screens,ui,views,states}/**` (buttons, screen backgrounds).
5. `LevelNN{Back,BG,FG}_mc` for NN = 01..20.
6. All attribute values of the form `"…_mc"` in `reference/data/*.xml`: the text images `*TextEN_mc` from `texts_en.xml`, the mission icons `iconBig/iconSmall` from `missions.xml`.

**Blacklist** (do not export into the game): `AGIntro_mc`, `Preloader`, `PreloaderBG_mc`, `PreloaderBar_mc`, `BtnArmor_mc`, `BtnArmorGames_mc`, `BtnArmorLogoSmall_mc`, `BtnMoreGames_mc`, `BtnFaceBook_mc`, `BtnTwitter_mc`, `BtnPatreon_mc`, all `LevelNNPhysic_mc` (the markup is needed only for checking levels in T0.7; its 1x raster goes to `build/extract/debug/`).

The final list of symbols is written to `build/extract/whitelist.json`. A report is printed separately: symbols from the whitelist that are missing from the SWF (an error), and SWF symbols with a class that fall into neither the whitelist nor the blacklist (a warning; they need to be reviewed).

### 4.3 Post-processing (sharp)
- **Cropping the level layers.** AntTileMap caches exactly 8×6 tiles of `CELL_SIZE = 100`, i.e. the symbol area `[0, 800) × [0, 600)`. Everything outside it is not visible in the original. We crop the PNG to `(0 − xMin) · Z … (800 − xMin) · Z` and likewise along Y (taking the origin into account). Result: `800Z × 600Z`, origin `(0, 0)`.
- **Trim** the transparent edges of each frame with an origin correction (no trim is done for level layers).
- **Dedup** identical frames within a symbol (sha1 of the pixels): in the manifest several frames refer to one region.
- **Overrides** from `tools/extract/asset-overrides.json`:
  ```json
  { "FadeEffectShow_mc": { "maxTier": "2x" }, "FadeEffectHide_mc": { "maxTier": "2x" },
    "PortalBG_mc": { "maxTier": "2x" } }
  ```
  `maxTier` means: for higher tiers take the raster of this tier and mark `scale` in the manifest.

### 4.4 Groups and atlases
- Groups (rules in `tools/extract/groups.json`):
  - `ui` — Btn*, Icon*, Title*, *TextEN_mc, screen backgrounds, popups, font images;
  - `shuttles` — Shuttle*, Engine*, Indicator*, ShuttleHull*;
  - `passengers` — Passenger*, Frag*;
  - `effects` — Smoke*, Fire*, Spark*, Flash*, Explosion*, Magic*, Particle*, Dust*, Oil*, Blow_mc, Wave*;
  - `game-common` — everything else;
  - `level-NN` — the three layers of a level.
- Packing: `maxrects-packer`, max 4096×4096, padding 2, extrude 1 (duplicate the edge pixels), `allowRotation: false`, POT not required. Output: `assets/gfx/{1x,2x,3x}/{group}-{n}.png` (PNG, sharp `compressionLevel 9`). For 2x/3x, lossless WebP is acceptable if the renderer loads it — decide by measuring the size.
- **Budget:** the raw export at 2x ≈ 580 Mpx, of which 435 are `AGIntro_mc` and 54 are FadeEffect*. The goal after blacklist/trim/dedupe: at 2x all groups except `level-NN` fit in ≤ 4 atlases of 4096². If more, the report shows the top 20 symbols by area, and overrides need to be picked.

### 4.4.1 Alpha masks for AntLight (simulation)
The sensors "see" the ship pixel by pixel (see `01-architecture` §5, "Light"). For all frames of the symbols drawn by `ShuttleView` and its children (`Shuttle0N*`, `Engine0N*`, `ShuttleHull*`, `Indicator*`, `Shuttle01Pass*` — assemble the exact list from `reference/as3/ru/alientransporter/views/ShuttleView.as`), a bit mask `alpha > 0` is built from the 1x raster before trim. The format is `assets/data/alphamasks.bin` + an index in `manifest.frames[i].mask = {offset, w, h}`: 1 bit per pixel, rows aligned to a byte, size = the untrimmed 1x frame (`ceil(rectWithFilters)`), starting from the top-left corner (i.e. the origin is the same as `origin1x`).

### 4.5 `assets/manifest.json`
```jsonc
{
  "version": 1,
  "buildHash": "<sha256 of the manifest contents without this field>",
  "tiers": ["1x","2x","3x"],
  "atlases": { "2x": { "ui-0": "gfx/2x/ui-0.png", ... }, ... },
  "frames": [                       // texId = index in this array (u16), stable for identical input
    { "key": "Coin_mc#0", "group": "game-common",
      "size1x": [24.4, 23.65],      // logical frame size before trim (NOT for AntActor.width/height: for an actor they = trim1x + 2 px on each side, like the BitmapData in AntAnimation.makeFromMovieClip; T4.2)
      "origin1x": [11.9, 11.95],    // registration point relative to the top-left corner of the UNtrimmed frame, at 1x
      "trim1x": [x, y, w, h],       // the trimmed rectangle relative to the untrimmed frame, at 1x
      "tiers": { "2x": { "atlas": "game-common-0", "rect": [x, y, w, h] }, "3x": { ... }, "1x": { ... } } }
  ],
  "symbols": { "Coin_mc": { "firstTexId": 123, "frames": 30 } }
}
```
Frame keys are 0-based: `Name#0 … Name#(N−1)`. In AS3 `gotoAndStop(1)` = frame 1 = `#0` (see the `AntAnimation` port).

## Step 5. Sounds (`sounds.ts`)

```bash
java -Djava.awt.headless=true -jar vendor/jpexs/ffdec-cli.jar -export sound build/extract/sounds vendor/original/AlienTransporter.swf
# default format: MP3 sounds are exported as .mp3 (check `--help export` if the names or extensions differ)
```
- Match by id → `className` (`ru.alientransporter.Sounds_SndEngineGas` → `SndEngineGas`, `Music_SndMusicMenu01` → `SndMusicMenu01`).
- `ffmpeg -i in.mp3 -f f32le` → PCM, trim to exactly `sampleCount` samples (from `symbols.json`; `seekSamples = 0` for all). → `ffmpeg … -c:a libvorbis -q:a 6 assets/sfx/<Name>.ogg`.
- **Loops** (the engine `SndEngineGas`, `SndPortalIdle`, `SndLowFuelAlarm`, music — the exact list from the `play(…, loops>0)` calls or the repeat flag in `reference/as3/ru/alientransporter/Sounds.as`, `MusicManager.as`): check for a click or silence at the seam (RMS of the first and last 20 ms, report). If there is silence from the MP3 padding, trim the leading silence (threshold −60 dBFS) only for loops and record `trimStartSamples` in `sounds.json`.
- `assets/sounds.json`: `[{ "id": 0, "name": "SndEngineGas", "file": "sfx/SndEngineGas.ogg", "loop": true, "rate": 44100, "samples": N }]`. `soundId` = the index, sorted by name (stable).

## Step 6. Data (`data.ts`)

- Fonts: `reference/data/fonts/fontXX.xml` + `.png` → `assets/data/fonts/fontXX.json` (`{name, charInterval, chars: {"A": {x,y,w,h}}}`). The font PNGs go into the `ui` atlas group as separate symbols `Font:font01` (glyphs are sub-rectangles).
- `missions.xml` → `assets/data/missions.json`, `texts_en.xml` → `texts.json`, `effects.xml` → `effects.json`. The structure mirrors the XML without semantic transformations: attributes → fields, repeated tags → arrays. Numbers as numbers, `true`/`false` as booleans — only where the AS3 code parses them as numbers or booleans (check against the code of `MissionManager`, `AntEffectManager`, `Text`).
- zod schemas in `src/engine/assets/schemas.ts`, validation in a test.

## Step 7. Levels and models (`levels.ts`)

Inputs: `placements.json`, `symbols.json`, `reference/as3/Level*Physic_mc.as`, `reference/as3/*Model_mc.as`, `reference/as3/*Ragdoll_mc.as`.

1. For each clip take the placements and sort them by `depth`.
2. Decompose the matrix as Flash does (`DisplayObject` getters):
   ```
   scaleX = sqrt(a² + b²);   scaleY = sqrt(c² + d²)
   if (a*d − b*c < 0) scaleY = −scaleY        // the reflection goes into scaleY (as in Flash Player)
   rotation = atan2(b, a) · 180/π             // degrees, range (−180, 180]
   x = tx; y = ty
   ```
   Also keep the raw matrix `matrix: [a,b,c,d,tx,ty]` — it will be useful for debugging.
3. The size is like Flash's `width/height` at `rotation = 0` (this is what `Ground.makeBoxBody`, `makeStopper` and the factories do): `width = (rect.xMax − rect.xMin) · |scaleX|`, `height = (rect.yMax − rect.yMin) · |scaleY|`, where `rect` is `symbols.json[className].rect` (without filters). Verified: `GroundBox_com` rect = (−16, −16, 32×32), `Station_com` = (−32.5, −32.5, 65×65).
4. Component parameters: in the clip's `.as` file find `function __setProp___idN__<Clip>_<layer>_<k>()` for `instanceName == "__idN_"` and collect the assignments `this.__idN_.<prop> = <value>;` (ignore the `componentInspectorSetting` lines). Values: numbers, quoted strings, `true/false`, arrays `[...]` (parse as JSON after replacing single quotes). Instances without a `__setProp` get `props: {}`.
5. Output:
   ```jsonc
   // assets/data/levels/level01.json
   { "name": "Level01", "clip": "Level01Physic_mc",
     "objects": [ { "depth": 3, "cls": "GroundBox_com", "instanceName": null,
                    "x": 63.7, "y": 279.25, "rotation": 30.0, "scaleX": 0.5, "scaleY": 3.3,
                    "width": 16.0, "height": 105.6, "matrix": [..], "props": {} }, ... ] }
   // assets/data/models.json
   { "Shuttle01Model_mc": { "objects": [ { "cls": "CircleShape_com", "instanceName": "__id3096_", ...,
        "props": { "alias": "Body", "density": 1, "friction": 0.3, "restitution": 0, "isSensor": false,
                   "animation": "...", "sortIndex": 0 } } ] }, ... }
   ```
   Do not include objects with `cls = null` in the JSON (this is editor artwork), but count them in the report.
6. **Parameter schema (actual, collected from the SWF):**
   - Levels:
     - `Station_com{alias,maxPassengers,isFuelStation,stationList?}`
     - `SpawnManager_com{alias,availPassengers,spawnInterval,lowerSpawnInterval,upperSpawnInterval,stationList?}`
     - `Trigger_com{alias,targetAliases?,triggerAliases?,isActive,once}`
     - `Sensor_com{alias,length,lowerAngle,upperAngle,isActive,targetAliases,once,rotate,lowerRotation,upperRotation,rotationSpeed,rotationDelay,blinkerAlias}`
     - `MissilePoint_com{alias,speed,respawnDelay,actionDelay,sensorAlias}`
     - `ObjectSpawner_com{alias,active,interval,lowerInterval,upperInterval,objects,count}`
     - `ObjectRemover_com{alias,active}`
     - `Transporter_com{alias,active,movementSpeed}`
     - `TransporterWheel_com` and `Blinker_com{alias,active,spriteKind,animationSpeed,reverse}`
     - `ExitPortal_com{alias,levelKey}`
     - `GoalManager_com{alias,goalKind,goalValue,targetAliases,triggerAliases?}`
     - `LevelPreferences_com{alias,allStarGoal,defRecord}`
     - `ShuttleSpawn_com{alias,player}`
     - `StaticEffect_com{alias,effect,active}`
     - `Tutorial_com{alias,isVisible,timeOut,animationName,layer}`
     - `Rock0N_com{alias,kind,actionDelay}`
     - `BarrelExp_com{alias,actionDelay}`
     - `CoinPoint_mc{alias,delay}`
     - `Passenger_com{alias,lowerLimit,upperLimit}`
     - without parameters: `GroundBox_com`, `GroundCircle_com`, `Stopper_com`, `HouseFront01_mc`, `KeyPoint_mc`, `SpawnPoint_mc`, `ArrowPoint_com`, `Barrel_com`, `BoxBig_com`, `BoxSmall_com`, `Coin_mc`, `Fuel_mc`, `Trophy_mc`, `Shuttle01PassGreen_mc`.
   - Models:
     - `RectShape_com` and `CircleShape_com{alias,density,friction,restitution,isSensor,animation,sortIndex,shapeList?}`
     - `RevoluteJoint_com{alias,lowerAngle,upperAngle,enableLimit,motorSpeed,maxMotorTorque,enableMotor,weakness,bodyAliasA,bodyAliasB}`
     - `PrismaticJoint_com{alias,lowerTranslation,upperTranslation,enableLimit,motorSpeed,maxMotorForce,enableMotor,weakness,bodyAliasA,bodyAliasB}`
7. **Checks (tests in `tools/extract/levels.test.ts`):**
   - 20 levels;
   - for each level the number of objects of each class with an `instanceName` matches the number of `public var __idN_:<Class>` fields in the `.as`;
   - totals across levels: GroundBox_com 609, GroundCircle_com 738, Station_com 73, CoinPoint_mc 264, Coin_mc 359, Sensor_com 36, MissilePoint_com 45, ExitPortal_com 20, ShuttleSpawn_com 40;
   - for all objects from the schema above, all required parameters are present;
   - **overlay:** for each level we draw (node-canvas or sharp + SVG) our ground boxes and circles on top of the 1x raster of `LevelNNPhysic_mc` (crop 800×600) → `build/extract/debug/levelNN-overlay.png`. Automated test: the center of each GroundBox_com falls on a pixel with a dominant green channel (the editor markup), with a tolerance of 2 px.

## Step 8. Final artifacts

```
reference/as3/**, reference/data/**                       (for the agents)
build/extract/{symbols,placements,whitelist}.json, debug/  (intermediate, reports)
assets/manifest.json, assets/gfx/{1x,2x,3x}/*.png
assets/sounds.json, assets/sfx/*.ogg
assets/data/{levels/*.json, models.json, missions.json, texts.json, effects.json, fonts/*.json}
```
At the end `npm run extract` prints a summary: the number of symbols and frames, the number of atlases by tier and group, the total Mpx by tier, the number of sounds, the number of levels and objects, warnings.
