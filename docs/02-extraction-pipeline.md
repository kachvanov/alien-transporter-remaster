# 02 — Пайплайн извлечения из SWF

`npm run extract` превращает `AlienTransporter.swf` во всё, что нужно игре и агентам. Пайплайн **идемпотентный**: повторный запуск пересобирает только изменившееся (по хэшам входов в `build/extract/.cache.json`). Каждый шаг — отдельный скрипт в `tools/extract/`, его можно запустить отдельно (`npm run extract -- --step=sprites`).

## Предпосылки

- Java 17 (`/opt/homebrew/opt/openjdk@17`), ffmpeg (`/opt/homebrew/bin/ffmpeg`), Node ≥ 22 — у пользователя уже установлены.
- `.env`: `ORIGINAL_SWF=/Applications/Flash Games/AlienTransporter.swf`. Скрипт копирует SWF в `vendor/original/AlienTransporter.swf` и проверяет SHA-256 (фиксируется при первом запуске в `tools/extract/swf.sha256`).
- Все java-вызовы выполняются с `-Djava.awt.headless=true`.

## Шаг 1. JPEXS (`tools/extract/get-jpexs.sh`)

```bash
URL=https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.3.0/ffdec_26.3.0.zip
SHA256=35f4930eb7c380afe66f2117f90b006deac0631473ad7500bb39c78f68645ecd
# скачать в vendor/jpexs/ffdec.zip, проверить shasum -a 256, распаковать в vendor/jpexs/
# CLI: java -jar vendor/jpexs/ffdec-cli.jar ; библиотека: vendor/jpexs/lib/ffdec_lib.jar (+ остальные jar в lib/)
```

## Шаг 2. Декомпиляция (`decompile.ts`)

```bash
java -Djava.awt.headless=true -jar vendor/jpexs/ffdec-cli.jar \
  -export script,binaryData,symbolClass build/extract/raw vendor/original/AlienTransporter.swf
```
- `build/extract/raw/scripts/**` → `reference/as3/**`: 1119 файлов, из них `ru/alientransporter` (~22.7K строк), `ru/antkarlov/anthill` (~20K), `Box2D/**` (~14K, справочно), корневые `Level*Physic_mc.as`, `*Model_mc.as` и т.д.
- `build/extract/raw/binaryData/*.bin` → `reference/data/` с понятными именами: `missions.xml`, `texts_en.xml`, `effects.xml`, `fonts/font01.xml` … (по суффиксу класса: `MissionManager_XmlMissions` → `missions.xml`, `Fonts_XmlFont04Blue` → `fonts/font04Blue.xml`).
- Проверено: декомпиляция чистая, артефактов `§§` нет. Скрипт всё равно должен падать, если найдёт `§§` в `reference/as3/ru/**`.
- Картинки растровых шрифтов (`Fonts_ImgFont*`, это `DefineBitsLossless2`) экспортировать отдельно: `-export image` → `reference/data/fonts/*.png` (сопоставление по SymbolClass).

## Шаг 3. `SymbolInfo.java` — границы символов, размещения, звук

Исходник лежит в `tools/extract/java/SymbolInfo.java`. **Он проверен на этом SWF.**
```bash
javac -cp "vendor/jpexs/lib/*" -d build/extract/java tools/extract/java/SymbolInfo.java
java -Djava.awt.headless=true -cp "vendor/jpexs/lib/*:build/extract/java" SymbolInfo \
  vendor/original/AlienTransporter.swf build/extract   # → symbols.json, placements.json
```
- `symbols.json`: массив `{id, className, kind: sprite|shape|image|sound|…, frames?, rect, rectWithFilters, sound?}`. Координаты в пикселях (twips / 20). `sound = {format: 2 (MP3), rate, stereo, sampleCount, seekSamples}`. Проверено: у всех 55 именованных звуков `seekSamples = 0`.
- `placements.json`: `{ "<ClassName>": [ {depth, characterId, className|null, instanceName|null, move, matrix:[a,b,c,d,tx,ty]} ] }` — кадр 1 каждого клипа, подходящего под regex `Level\d\dPhysic_mc|.*Model_mc|.*Ragdoll_mc`. Всего 53 клипа: 20 уровней и 33 модели/рэгдолла. Порядок — порядок тегов. **Перед использованием сортировать по `depth`**, потому что в AS3 `getChildAt(i)` — это порядок глубин.
- Проверено: в `Level01Physic_mc` 189 размещений (GroundBox_com 16, GroundCircle_com 18, Station_com 2, Trigger_com 5 и т.д.). 108 из них `className = null`: это безымянная графика редактора, игра её игнорирует.

## Шаг 4. Спрайты (`sprites.ts`)

### 4.1 Экспорт
```bash
for Z in 1 2 3; do
  java -Djava.awt.headless=true -jar vendor/jpexs/ffdec-cli.jar -zoom $Z -format sprite:png \
    -export sprite build/extract/sprites/${Z}x vendor/original/AlienTransporter.swf
done
```
- JPEXS экспортирует все 596 спрайтов (на 2x ~47 с). Папки называются `DefineSprite_<id>_<Class>_<Class>/` или `DefineSprite_<id>/`, кадры — `1.png … N.png`. Сопоставлять по `<id>` с `symbols.json`.
- **Регистрационная точка (проверено на всех 590 спрайтах):** JPEXS рендерит каждый кадр в холст размером `ceil(rectWithFilters · Z)` (±1 px), левый верхний угол = `(rectWithFilters.xMin, rectWithFilters.yMin)`. Значит origin кадра (где в PNG лежит точка (0,0) символа) = `(−rectWithFilters.xMin · Z, −rectWithFilters.yMin · Z)`. У 46 спрайтов с фильтрами `rectWithFilters ≠ rect`, у остальных они совпадают.

### 4.2 Какие символы берём (whitelist, собирается автоматически)
1. Список классов из `reference/as3/ru/alientransporter/Assets.as` (`new <Class>[...]`, ~413 имён).
2. Все строковые литералы `addAnimationFromCache("X"…)` по всему `reference/as3/ru/**` (146 уникальных).
3. `<Clip name="X"/>` из `CacheList` в `reference/data/effects.xml`.
4. Строковые литералы вида `"…_mc"` в `ru/alientransporter/{screens,ui,views,states}/**` (кнопки, фоны экранов).
5. `LevelNN{Back,BG,FG}_mc` для NN = 01..20.
6. Все значения атрибутов вида `"…_mc"` в `reference/data/*.xml`: картинки текстов `*TextEN_mc` из `texts_en.xml`, иконки миссий `iconBig/iconSmall` из `missions.xml`.

**Blacklist** (не экспортировать в игру): `AGIntro_mc`, `Preloader`, `PreloaderBG_mc`, `PreloaderBar_mc`, `BtnArmor_mc`, `BtnArmorGames_mc`, `BtnArmorLogoSmall_mc`, `BtnMoreGames_mc`, `BtnFaceBook_mc`, `BtnTwitter_mc`, `BtnPatreon_mc`, все `LevelNNPhysic_mc` (разметка нужна только для проверки уровней в T0.7, её 1x-растр кладётся в `build/extract/debug/`).

Итоговый список символов пишется в `build/extract/whitelist.json`. Отдельно печатается отчёт: символы из whitelist, которых нет в SWF (ошибка), и символы SWF с классом, не попавшие ни в whitelist, ни в blacklist (предупреждение, их нужно просмотреть).

### 4.3 Пост-обработка (sharp)
- **Кроп слоёв уровней.** AntTileMap кеширует ровно 8×6 тайлов по `CELL_SIZE = 100`, то есть область символа `[0, 800) × [0, 600)`. Всё за её пределами в оригинале не видно. Кропаем PNG в `(0 − xMin) · Z … (800 − xMin) · Z` и так же по Y (с учётом origin). Итог: `800Z × 600Z`, origin `(0, 0)`.
- **Trim** прозрачных краёв каждого кадра с поправкой origin (у слоёв уровня trim не делается).
- **Дедуп** одинаковых кадров внутри символа (sha1 пикселей): в manifest несколько кадров ссылаются на один регион.
- **Overrides** из `tools/extract/asset-overrides.json`:
  ```json
  { "FadeEffectShow_mc": { "maxTier": "2x" }, "FadeEffectHide_mc": { "maxTier": "2x" },
    "PortalBG_mc": { "maxTier": "2x" } }
  ```
  `maxTier` означает: для более высоких тиров брать растр этого тира и помечать `scale` в manifest.

### 4.4 Группы и атласы
- Группы (правила в `tools/extract/groups.json`):
  - `ui` — Btn*, Icon*, Title*, *TextEN_mc, фоны экранов, попапы, шрифты-картинки;
  - `shuttles` — Shuttle*, Engine*, Indicator*, ShuttleHull*;
  - `passengers` — Passenger*, Frag*;
  - `effects` — Smoke*, Fire*, Spark*, Flash*, Explosion*, Magic*, Particle*, Dust*, Oil*, Blow_mc, Wave*;
  - `game-common` — всё остальное;
  - `level-NN` — три слоя уровня.
- Упаковка: `maxrects-packer`, max 4096×4096, padding 2, extrude 1 (продублировать краевые пиксели), `allowRotation: false`, POT не обязателен. Выход: `assets/gfx/{1x,2x,3x}/{group}-{n}.png` (PNG, sharp `compressionLevel 9`). Для 2x/3x допустим WebP lossless, если рендерер его грузит — решить по замеру размера.
- **Бюджет:** сырой экспорт на 2x ≈ 580 Мпкс, из них 435 — `AGIntro_mc`, 54 — FadeEffect*. Цель после blacklist/trim/dedupe: на 2x все группы кроме `level-NN` ≤ 4 атласа 4096². Если больше, отчёт показывает топ-20 символов по площади, и нужно подобрать overrides.

### 4.4.1 Альфа-маски для AntLight (симуляция)
Сенсоры «видят» корабль попиксельно (см. `01-architecture` §5, «Свет»). Для всех кадров символов, которые рисует `ShuttleView` и его дети (`Shuttle0N*`, `Engine0N*`, `ShuttleHull*`, `Indicator*`, `Shuttle01Pass*` — точный список собрать по `reference/as3/ru/alientransporter/views/ShuttleView.as`), из 1x-растра до trim строится битовая маска `alpha > 0`. Формат `assets/data/alphamasks.bin` + индекс в `manifest.frames[i].mask = {offset, w, h}`: 1 бит на пиксель, строки выровнены по байту, размер = необрезанный 1x-кадр (`ceil(rectWithFilters)`), начало — левый верхний угол (то есть origin тот же, что `origin1x`).

### 4.5 `assets/manifest.json`
```jsonc
{
  "version": 1,
  "buildHash": "<sha256 от содержимого manifest без этого поля>",
  "tiers": ["1x","2x","3x"],
  "atlases": { "2x": { "ui-0": "gfx/2x/ui-0.png", ... }, ... },
  "frames": [                       // texId = индекс в этом массиве (u16), стабилен при одинаковом входе
    { "key": "Coin_mc#0", "group": "game-common",
      "size1x": [24.4, 23.65],      // логический размер кадра до trim (для AntActor.width/height)
      "origin1x": [11.9, 11.95],    // регистрационная точка относительно левого верхнего угла НЕобрезанного кадра, в 1x
      "trim1x": [x, y, w, h],       // обрезанный прямоугольник относительно необрезанного кадра, в 1x
      "tiers": { "2x": { "atlas": "game-common-0", "rect": [x, y, w, h] }, "3x": { ... }, "1x": { ... } } }
  ],
  "symbols": { "Coin_mc": { "firstTexId": 123, "frames": 30 } }
}
```
Ключи кадров 0-based: `Name#0 … Name#(N−1)`. В AS3 `gotoAndStop(1)` = кадр 1 = `#0` (см. порт `AntAnimation`).

## Шаг 5. Звуки (`sounds.ts`)

```bash
java -Djava.awt.headless=true -jar vendor/jpexs/ffdec-cli.jar -export sound build/extract/sounds vendor/original/AlienTransporter.swf
# формат по умолчанию: MP3-звуки экспортируются как .mp3 (проверить `--help export`, если имена или расширения отличаются)
```
- Сопоставление по id → `className` (`ru.alientransporter.Sounds_SndEngineGas` → `SndEngineGas`, `Music_SndMusicMenu01` → `SndMusicMenu01`).
- `ffmpeg -i in.mp3 -f f32le` → PCM, обрезать до ровно `sampleCount` сэмплов (из `symbols.json`; `seekSamples = 0` у всех). → `ffmpeg … -c:a libvorbis -q:a 6 assets/sfx/<Name>.ogg`.
- **Лупы** (движок `SndEngineGas`, `SndPortalIdle`, `SndLowFuelAlarm`, музыка — точный список по вызовам `play(…, loops>0)` или флагу repeat в `reference/as3/ru/alientransporter/Sounds.as`, `MusicManager.as`): проверить щелчок или тишину на стыке (RMS первых и последних 20 мс, отчёт). Если есть тишина от MP3-паддинга, срезать ведущую тишину (порог −60 dBFS) только у лупов и записать `trimStartSamples` в `sounds.json`.
- `assets/sounds.json`: `[{ "id": 0, "name": "SndEngineGas", "file": "sfx/SndEngineGas.ogg", "loop": true, "rate": 44100, "samples": N }]`. `soundId` = индекс, отсортированный по имени (стабильно).

## Шаг 6. Данные (`data.ts`)

- Шрифты: `reference/data/fonts/fontXX.xml` + `.png` → `assets/data/fonts/fontXX.json` (`{name, charInterval, chars: {"A": {x,y,w,h}}}`). PNG шрифтов идут в группу атласов `ui` как отдельные символы `Font:font01` (глифы — подпрямоугольники).
- `missions.xml` → `assets/data/missions.json`, `texts_en.xml` → `texts.json`, `effects.xml` → `effects.json`. Структура повторяет XML без смысловых преобразований: атрибуты → поля, повторяющиеся теги → массивы. Числа как числа, `true`/`false` как boolean — только там, где AS3-код парсит их как числа или булевы (проверить по коду `MissionManager`, `AntEffectManager`, `Text`).
- zod-схемы в `src/engine/assets/schemas.ts`, валидация в тесте.

## Шаг 7. Уровни и модели (`levels.ts`)

Входы: `placements.json`, `symbols.json`, `reference/as3/Level*Physic_mc.as`, `reference/as3/*Model_mc.as`, `reference/as3/*Ragdoll_mc.as`.

1. Для каждого клипа взять размещения, отсортировать по `depth`.
2. Разложить матрицу как Flash (`DisplayObject` getters):
   ```
   scaleX = sqrt(a² + b²);   scaleY = sqrt(c² + d²)
   if (a*d − b*c < 0) scaleY = −scaleY        // отражение уходит в scaleY (как в Flash Player)
   rotation = atan2(b, a) · 180/π             // градусы, диапазон (−180, 180]
   x = tx; y = ty
   ```
   Сохранить и сырую матрицу `matrix: [a,b,c,d,tx,ty]` — пригодится для отладки.
3. Размер как у Flash `width/height` при `rotation = 0` (так делают `Ground.makeBoxBody`, `makeStopper`, фабрики): `width = (rect.xMax − rect.xMin) · |scaleX|`, `height = (rect.yMax − rect.yMin) · |scaleY|`, где `rect` — `symbols.json[className].rect` (без фильтров). Проверено: `GroundBox_com` rect = (−16, −16, 32×32), `Station_com` = (−32.5, −32.5, 65×65).
4. Параметры компонента: в `.as`-файле клипа найти `function __setProp___idN__<Clip>_<layer>_<k>()` для `instanceName == "__idN_"` и собрать присваивания `this.__idN_.<prop> = <value>;` (игнорировать строки `componentInspectorSetting`). Значения: числа, строки в кавычках, `true/false`, массивы `[...]` (разобрать как JSON после замены одинарных кавычек). Инстансы без `__setProp` получают `props: {}`.
5. Выход:
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
   Объекты с `cls = null` в JSON не включать (это графика редактора), но посчитать их в отчёте.
6. **Схема параметров (фактическая, собрана с SWF):**
   - Уровни:
     - `Station_com{alias,maxPassengers,isFuelStation,stationList?}`
     - `SpawnManager_com{alias,availPassengers,spawnInterval,lowerSpawnInterval,upperSpawnInterval,stationList?}`
     - `Trigger_com{alias,targetAliases?,triggerAliases?,isActive,once}`
     - `Sensor_com{alias,length,lowerAngle,upperAngle,isActive,targetAliases,once,rotate,lowerRotation,upperRotation,rotationSpeed,rotationDelay,blinkerAlias}`
     - `MissilePoint_com{alias,speed,respawnDelay,actionDelay,sensorAlias}`
     - `ObjectSpawner_com{alias,active,interval,lowerInterval,upperInterval,objects,count}`
     - `ObjectRemover_com{alias,active}`
     - `Transporter_com{alias,active,movementSpeed}`
     - `TransporterWheel_com` и `Blinker_com{alias,active,spriteKind,animationSpeed,reverse}`
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
     - без параметров: `GroundBox_com`, `GroundCircle_com`, `Stopper_com`, `HouseFront01_mc`, `KeyPoint_mc`, `SpawnPoint_mc`, `ArrowPoint_com`, `Barrel_com`, `BoxBig_com`, `BoxSmall_com`, `Coin_mc`, `Fuel_mc`, `Trophy_mc`, `Shuttle01PassGreen_mc`.
   - Модели:
     - `RectShape_com` и `CircleShape_com{alias,density,friction,restitution,isSensor,animation,sortIndex,shapeList?}`
     - `RevoluteJoint_com{alias,lowerAngle,upperAngle,enableLimit,motorSpeed,maxMotorTorque,enableMotor,weakness,bodyAliasA,bodyAliasB}`
     - `PrismaticJoint_com{alias,lowerTranslation,upperTranslation,enableLimit,motorSpeed,maxMotorForce,enableMotor,weakness,bodyAliasA,bodyAliasB}`
7. **Проверки (тесты в `tools/extract/levels.test.ts`):**
   - 20 уровней;
   - для каждого уровня число объектов каждого класса с `instanceName` совпадает с числом полей `public var __idN_:<Class>` в `.as`;
   - суммарно по уровням: GroundBox_com 609, GroundCircle_com 738, Station_com 73, CoinPoint_mc 264, Coin_mc 359, Sensor_com 36, MissilePoint_com 45, ExitPortal_com 20, ShuttleSpawn_com 40;
   - у всех объектов из схемы выше все обязательные параметры на месте;
   - **оверлей:** для каждого уровня рисуем (node-canvas или sharp + SVG) наши ground-боксы и круги поверх 1x-растра `LevelNNPhysic_mc` (кроп 800×600) → `build/extract/debug/levelNN-overlay.png`. Автотест: центр каждого GroundBox_com попадает в пиксель с доминирующим зелёным каналом (разметка редактора) с допуском 2 px.

## Шаг 8. Итоговые артефакты

```
reference/as3/**, reference/data/**                       (для агентов)
build/extract/{symbols,placements,whitelist}.json, debug/  (промежуточное, отчёты)
assets/manifest.json, assets/gfx/{1x,2x,3x}/*.png
assets/sounds.json, assets/sfx/*.ogg
assets/data/{levels/*.json, models.json, missions.json, texts.json, effects.json, fonts/*.json}
```
В конце `npm run extract` печатает сводку: число символов и кадров, число атласов по тирам и группам, суммарные Мпкс по тирам, число звуков, число уровней и объектов, предупреждения.
