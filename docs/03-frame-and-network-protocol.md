# 03 — Формат `Frame` и сетевой протокол

Всё двоичное — **little-endian** (`DataView` с `littleEndian = true`). Один и тот же формат `Frame` идёт из воркера в рендерер и от хоста к клиенту по сети. Реализация — `src/frame/` (writer/reader) и `src/net/protocol.ts`. Константы и версии живут в `src/frame/constants.ts` и `src/net/protocol.ts`.

## 1. `Frame` (type = 0x01)

### Заголовок (26 байт)
| off | тип | поле | описание |
|---|---|---|---|
| 0 | u8 | type | `0x01` |
| 1 | u32 | tick | номер тика симуляции (с запуска воркера) |
| 5 | u8 | flags | bit0 `paused`, bit1 `sceneReset` (все узлы телепортируются — смена экрана/уровня), bit2 `hasDebug` |
| 6 | u16 | musicTrack | `soundId` музыкального трека, `0xFFFF` = тишина |
| 8 | u8 | musicVol | 0..255 (итог громкости MusicManager) |
| 9 | u8 | muteFlags | bit0 музыка выключена, bit1 звуки выключены |
| 10 | u16 | levelGroup | 1..20 — атлас `level-NN`, который должен быть загружен; `0xFFFF` — никакой |
| 12 | u16 | tickCost | время последнего тика в сотых мс (для F3) |
| 14 | u32 | reserved | 0 |
| 18 | u16 | nodeCount | |
| 20 | u16 | oneShotCount | |
| 22 | u16 | loopCount | |
| 24 | u16 | extBytes | справочно: суммарный размер ext-блоков (для валидации) |

### Узел (Node), `nodeCount` штук, в порядке отрисовки (сзади → вперёд)
| тип | поле | условие |
|---|---|---|
| u32 | uid | `(entityId << 8) \| subIndex`; subIndex = 0 у обычных сущностей, 0..255 у глифов Label |
| u16 | texId | индекс в `manifest.frames`; `0xFFFF` — без текстуры (только ext) |
| u8 | flags | bit0 `teleport`, bit1 `hasScale`, bit2 `hasAlpha`, bit3 `hasTint`, bit4-5 `blend` (0 normal, 1 add, 2 overlay, 3 screen), bit6 `hasExt`, bit7 резерв |
| f32 | x | экранные координаты 800×600 (камера и scrollFactor уже применены) |
| f32 | y | |
| f32 | rotation | радианы, итоговый (глобальный) |
| f32, f32 | scaleX, scaleY | если `hasScale` (иначе 1, 1) |
| u8 | alpha | если `hasAlpha` (0..255; иначе 255) |
| u8, u8, u8 | r, g, b | если `hasTint` (multiply; иначе белый) |
| … | ext | если `hasExt`: см. ниже |

Узел пишется, только если сущность и все её предки `exists && visible` и у неё есть что рисовать (кадр анимации, глиф или ext). Проверка «на экране» не делается: рисовать за пределами экрана не страшно, а однозначность важнее.

### Ext-блоки (`u8 extType` + данные)
- `0x01 LIGHT` (AntLight):
  `u16 pointCount`, затем `pointCount × (f32 x, f32 y)` — полигон в экранных координатах (первая точка — центр источника);
  `f32 gradCenterX, gradCenterY, gradRadius`;
  `u8 stopCount`, затем `stopCount × (u8 ratio, u8 r, u8 g, u8 b, u8 a)`;
  `f32 blurX, blurY`.
- `0x02 DEBUG_LINES` (только dev, если `flags.hasDebug`): `u16 n`, затем `n × (f32 x1, y1, x2, y2, u32 rgba)` — Box2D debug draw.

### OneShot (`oneShotCount` штук)
`u16 soundId | u8 volume (0..255) | i8 pan (−127..127 → −1..1)`

### Loop (`loopCount` штук — **все** активные лупы на этот тик)
`u16 channelId | u16 soundId | u8 volume | i8 pan`. `channelId` — стабильный id экземпляра `AntSound`, пока он играет.

### Правило `teleport`
FrameWriter ставит `teleport = 1`, если:
- uid новый;
- сущность в этом тике `reset()`/`revive()`-нулась (флаг `justReset` в AntEntity; его выставляют `reset`/`revive`, а FrameWriter сбрасывает);
- расстояние от прошлого кадра больше 200 px;
- в заголовке стоит `sceneReset`.

### Бюджет
~600 узлов × ~21 Б + свет ≈ 13 КБ на кадр, ×35 ≈ 450 КБ/с. На LAN нормально. Если по замеру больше 500 КБ/с — сначала включить `perMessageDeflate` у `ws`, потом думать про дельты.

### Тесты
Round-trip (запись → чтение → глубокое равенство) на синтетических кадрах: пустой, 1000 узлов со всеми флагами, свет со 100 точками. Граничные значения u16/i8. Невалидный буфер (обрезанный) → понятная ошибка, а не падение.

## 2. Transport

- Хост: `ws` (`WebSocketServer`, `noServer: false`, `port: 47020`, `perMessageDeflate: false`), слушать `0.0.0.0`. Одновременно не больше одного клиента.
- Клиент: браузерный `WebSocket('ws://<ip>:<port>')`, `binaryType = 'arraybuffer'`.
- Текстовые сообщения (JSON) — handshake и управление; бинарные — `Frame` (0x01) и `Input` (0x02).
- Порт настраивается (Settings → Network). Поле ввода принимает `ip` или `ip:port`.

## 3. Handshake и управление (JSON)

```jsonc
// клиент → хост, сразу после open
{ "t": "hello", "proto": 1, "buildHash": "<manifest.buildHash>", "name": "MacBook", 
  "ship": { "shuttleKind": 0, "shuttleColor": 2, "engineKind": 0, "engineColor": 1 } }

// хост → клиент
{ "t": "welcome", "proto": 1, "hostName": "Windows-PC", "tickRate": 35 }
{ "t": "reject", "reason": "full" | "version" | "busy" }     // и закрыть сокет кодом 4000/4001/4002

// хост → клиент, по событиям
{ "t": "notice", "text": "Host paused" }                      // необязательные уведомления
{ "t": "bye", "reason": "host_quit" }                         // хост закрывает сессию

// клиент → хост
{ "t": "bye" }                                                // клиент уходит сам
```
- `proto` — версия протокола (константа, начинается с 1).
- `buildHash` должен совпадать: `texId` и `soundId` — индексы общего manifest. Если не совпал — `reject: version`, клиент показывает «Different game version on host and client».

## 4. Ввод клиента (type = 0x02, 6 байт)

`u8 type=0x02 | u32 seq | u8 bits` — bit0 `gas`, bit1 `left`, bit2 `right`, bit3 `pauseReq` (фронт нажатия P).
- Клиент берёт свои локальные клавиши. Для P1-раскладки (`keyP1Gas/Left/Right`) **и** P2-раскладки (`keyP2*`) это «газ/влево/вправо» — чтобы клиенту было удобно любой рукой.
- Отправка на каждое изменение битов плюс heartbeat с частотой 35 Гц.
- Хост: пакеты с `seq` меньше последнего принятого отбрасываются. Последнее состояние битов отдаётся в воркер (`InputRouter`) и применяется в начале следующего тика.

## 5. Keepalive и обрывы

- Хост раз в секунду шлёт ping (`ws.ping()`); нет pong за 5 с — клиент отключён.
- Клиент: нет `Frame` 3 с — показать «Connection lost», закрыть сокет, вернуться в главное меню.
- **Клиент отключился посреди уровня:** хост отключает удалённый ввод, корабль P2 снимается с уровня так же, как в оригинале при выходе P2 из игры (найти в `UISystem`/`GameScreen` соответствующий путь, иначе удалить шаттл без взрыва), и появляется уведомление «Player 2 disconnected». Игра хоста продолжается.
- **Хост закрыл игру или ушёл в меню «Online → Stop»:** `{t:"bye"}`, затем close. Клиент показывает сообщение и возвращается в меню.

## 6. Клиентский jitter-буфер

- Входящие `Frame` складываются в очередь с `arrivalTime`.
- Целевая задержка `D` = от 1.5 до 3 тиков (от 43 до 86 мс). Старт с 2 тиков, адаптация по джиттеру: `D = clamp(1.5, 3, 1 + 2·σ(intervals)/tick)`, пересчёт раз в секунду.
- Часы воспроизведения: `renderTick = latestTick − D` (дробное). `FramePlayer` интерполирует между кадрами `floor(renderTick)` и `ceil(renderTick)`.
- Буфер больше 6 кадров (догонялись после паузы сети) — выбросить старые до `D`.
- Звук: oneShot-события проигрываются, когда их кадр становится «текущим» для рендера. Лупы сверяются с текущим кадром.

## 7. UDP-автопоиск (порт 47021)

- Хост каждую секунду шлёт JSON-датаграмму на `255.255.255.255:47021` и на broadcast-адрес каждого IPv4-интерфейса (`os.networkInterfaces()`, адрес | ~маска):
  ```json
  { "game": "AT-remaster", "proto": 1, "buildHash": "…", "hostName": "MacBook-Pro", "port": 47020, "status": "waiting" | "full" }
  ```
- Клиент (`dgram`, `reuseAddr: true`, bind `0.0.0.0:47021`) собирает ответы в список `{ip (rinfo.address), hostName, port, status, lastSeen}` и выбрасывает записи старше 3 с. Несовпадающий `buildHash` показывается серым с подписью «different version».
- Всё это живёт в main (`electron/net/discovery.ts`), список уходит в renderer через IPC.

## 8. Платформенные требования

- macOS: в `electron-builder` → `mac.extendInfo.NSLocalNetworkUsageDescription = "Alien Transporter uses the local network to find and join LAN games."`. Первое подключение к LAN или broadcast вызывает системный запрос — нужно разрешить. Если включён фаервол macOS — «Allow incoming connections».
- Windows: при первом `listen` Defender Firewall спрашивает доступ — нужно разрешить «Private networks». Wi-Fi-сеть должна быть «Частная» (Settings → Network → Wi-Fi → Properties). В README дать пошаговую инструкцию с командой проверки `Test-NetConnection <ip> -Port 47020`.
- Экран Online → Host показывает все IPv4-адреса машины (кроме 127.0.0.1 и link-local 169.254.*) и порт.
