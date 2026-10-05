// zod schema of assets/manifest.json (docs/02-extraction-pipeline.md §4.5).
// Written by tools/extract/sprites.ts, read and validated by the engine's asset loader.
import { z } from 'zod';

export const TIER_NAMES = ['1x', '2x', '3x'] as const;
export const TierNameSchema = z.enum(TIER_NAMES);
export type TierName = z.infer<typeof TierNameSchema>;

/** Zoom factor of each tier. */
export const TIER_ZOOM: Record<TierName, number> = { '1x': 1, '2x': 2, '3x': 3 };

const IntSchema = z.number().int();

/** `[x, y, w, h]` in integer pixels. */
export const IntRectSchema = z.tuple([IntSchema, IntSchema, IntSchema, IntSchema]);
export type IntRect = z.infer<typeof IntRectSchema>;

/** `[x, y]` / `[w, h]` in logical (1x) pixels, may be fractional. */
export const PairSchema = z.tuple([z.number(), z.number()]);

/**
 * Bit mask (1 bit per pixel, `alpha > 0`, rows padded to whole bytes, MSB first)
 * of the full untrimmed 1x frame, stored in assets/data/alphamasks.bin.
 */
export const MaskRefSchema = z.object({
  /** Byte offset into alphamasks.bin. */
  offset: IntSchema.nonnegative(),
  w: IntSchema.positive(),
  h: IntSchema.positive(),
});
export type MaskRef = z.infer<typeof MaskRefSchema>;

export const TierFrameSchema = z.object({
  /** Key into `atlases[tier]`. */
  atlas: z.string(),
  /** Rectangle of the trimmed frame inside the atlas page, in atlas pixels. */
  rect: IntRectSchema,
  /**
   * Trimmed rectangle relative to the UNtrimmed frame of this tier's raster
   * (raster pixels, see `scale`).
   */
  trim: IntRectSchema,
  /**
   * Raster zoom / nominal tier zoom. Omitted (= 1) normally. Set when the raster of a
   * lower tier stands in for this one (asset-overrides `maxTier`, bitmap fonts):
   * the renderer must scale the sprite by `1 / scale`.
   */
  scale: z.number().positive().optional(),
});
export type TierFrame = z.infer<typeof TierFrameSchema>;

export const FrameSchema = z.object({
  /** `<Symbol>#<0-based frame>`; `gotoAndStop(n)` in AS3 = key `#(n-1)`. */
  key: z.string(),
  group: z.string(),
  /** Logical size of the untrimmed frame (for AntActor.width/height). */
  size1x: PairSchema,
  /** Registration point relative to the top-left corner of the untrimmed frame, 1x. */
  origin1x: PairSchema,
  /** Trimmed rectangle relative to the untrimmed frame, 1x pixels. */
  trim1x: IntRectSchema,
  /** Present only for frames used by AntLight (ShuttleView and its children). */
  mask: MaskRefSchema.optional(),
  tiers: z.object({
    '1x': TierFrameSchema,
    '2x': TierFrameSchema,
    '3x': TierFrameSchema,
  }),
  /**
   * FIX-11: the smooth variant of a pixel-art frame (a button, a caption, an icon, a glyph, ...): the same trimmed rectangle
   * in size, resampled smoothly from the 1x pixels instead of replicated k x k. `tiers` holds the pixel-exact variant (the
   * default); the renderer takes this one when the UI scaling is `smooth`. Only 2x and 3x have it (at 1x both are the same).
   */
  smooth: z.object({ '2x': TierFrameSchema.optional(), '3x': TierFrameSchema.optional() }).optional(),
});
export type Frame = z.infer<typeof FrameSchema>;

export const SymbolRefSchema = z.object({
  firstTexId: IntSchema.nonnegative(),
  frames: IntSchema.positive(),
});
export type SymbolRef = z.infer<typeof SymbolRefSchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  /** sha256 of the manifest JSON serialized without this field. */
  buildHash: z.string().regex(/^[0-9a-f]{64}$/),
  tiers: z.tuple([z.literal('1x'), z.literal('2x'), z.literal('3x')]),
  /** tier -> atlas key (`<group>-<n>`) -> path relative to assets/. */
  atlases: z.object({
    '1x': z.record(z.string(), z.string()),
    '2x': z.record(z.string(), z.string()),
    '3x': z.record(z.string(), z.string()),
  }),
  /** texId = index in this array (u16). */
  frames: z.array(FrameSchema).max(65536),
  symbols: z.record(z.string(), SymbolRefSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export function parseManifest(json: string): Manifest {
  return ManifestSchema.parse(JSON.parse(json));
}

// ---------------------------------------------------------------------------------------
// assets/data/levels/levelNN.json and assets/data/models.json
// (docs/02-extraction-pipeline.md §7.5-7.6, written by tools/extract/levels.ts).
// ---------------------------------------------------------------------------------------

const StringListSchema = z.array(z.string());

/** Flash matrix `[a, b, c, d, tx, ty]`. */
export const MatrixSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const PlacedBaseShape = {
  /** Depth in the parent clip: creation order = `getChildAt` order of the original. */
  depth: IntSchema,
  instanceName: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  /** Degrees, (-180, 180], y down, clockwise positive. */
  rotation: z.number(),
  scaleX: z.number(),
  /** Negative for reflected clips. */
  scaleY: z.number(),
  /** Flash `width`/`height` at `rotation = 0`. */
  width: z.number(),
  height: z.number(),
  matrix: MatrixSchema,
};

const NoProps = z.strictObject({});

/**
 * Object of a given class. Instances without an inspector initialiser (`instanceName === null`)
 * have `props = {}`; named instances must carry every required parameter of the class.
 */
function placed<C extends string, S extends z.ZodRawShape>(cls: C, propsShape: S) {
  return z
    .strictObject({
      ...PlacedBaseShape,
      cls: z.literal(cls),
      props: z.union([z.strictObject(propsShape), NoProps]),
    })
    .refine((o) => o.instanceName === null || Object.keys(o.props).length > 0, {
      message: `${cls}: named instance without parameters`,
      path: ['props'],
    });
}

/** Class without inspector parameters. */
function plain<C extends string>(cls: C) {
  return z.strictObject({ ...PlacedBaseShape, cls: z.literal(cls), props: NoProps });
}

const RockProps = { alias: z.string(), kind: z.string(), actionDelay: z.number() };
const BlinkerProps = {
  alias: z.string(),
  active: z.boolean(),
  spriteKind: z.string(),
  animationSpeed: z.number(),
  reverse: z.boolean(),
};
const ShapeProps = {
  alias: z.string(),
  density: z.number(),
  friction: z.number(),
  restitution: z.number(),
  isSensor: z.boolean(),
  animation: z.string(),
  sortIndex: z.number(),
  shapeList: StringListSchema.optional(),
};

/** Level markup objects, discriminated by `cls`. */
export const LevelObjectSchema = z.discriminatedUnion('cls', [
  placed('Station_com', {
    alias: z.string(),
    maxPassengers: z.number(),
    isFuelStation: z.boolean(),
    stationList: StringListSchema.optional(),
  }),
  placed('SpawnManager_com', {
    alias: z.string(),
    availPassengers: z.number(),
    spawnInterval: z.number(),
    lowerSpawnInterval: z.number(),
    upperSpawnInterval: z.number(),
    stationList: StringListSchema.optional(),
  }),
  placed('Trigger_com', {
    alias: z.string(),
    targetAliases: StringListSchema.optional(),
    triggerAliases: StringListSchema.optional(),
    isActive: z.boolean(),
    once: z.boolean(),
  }),
  placed('Sensor_com', {
    alias: z.string(),
    length: z.number(),
    lowerAngle: z.number(),
    upperAngle: z.number(),
    isActive: z.boolean(),
    targetAliases: StringListSchema,
    once: z.boolean(),
    rotate: z.boolean(),
    lowerRotation: z.number(),
    upperRotation: z.number(),
    rotationSpeed: z.number(),
    rotationDelay: z.number(),
    blinkerAlias: z.string(),
  }),
  placed('MissilePoint_com', {
    alias: z.string(),
    speed: z.number(),
    respawnDelay: z.number(),
    actionDelay: z.number(),
    sensorAlias: z.string(),
  }),
  placed('ObjectSpawner_com', {
    alias: z.string(),
    active: z.boolean(),
    interval: z.number(),
    lowerInterval: z.number(),
    upperInterval: z.number(),
    objects: StringListSchema,
    count: z.number(),
  }),
  placed('ObjectRemover_com', { alias: z.string(), active: z.boolean() }),
  placed('Transporter_com', { alias: z.string(), active: z.boolean(), movementSpeed: z.number() }),
  placed('TransporterWheel_com', BlinkerProps),
  placed('Blinker_com', BlinkerProps),
  placed('ExitPortal_com', { alias: z.string(), levelKey: z.string() }),
  placed('GoalManager_com', {
    alias: z.string(),
    goalKind: z.string(),
    goalValue: z.number(),
    targetAliases: StringListSchema,
    triggerAliases: StringListSchema.optional(),
  }),
  placed('LevelPreferences_com', {
    alias: z.string(),
    allStarGoal: z.number(),
    defRecord: z.number(),
  }),
  placed('ShuttleSpawn_com', { alias: z.string(), player: z.string() }),
  placed('StaticEffect_com', { alias: z.string(), effect: z.string(), active: z.boolean() }),
  placed('Tutorial_com', {
    alias: z.string(),
    isVisible: z.boolean(),
    timeOut: z.number(),
    animationName: z.string(),
    layer: z.string(),
  }),
  placed('Rock01_com', RockProps),
  placed('Rock02_com', RockProps),
  placed('Rock03_com', RockProps),
  placed('Rock04_com', RockProps),
  placed('Rock05_com', RockProps),
  placed('Rock06_com', RockProps),
  placed('Rock07_com', RockProps),
  placed('BarrelExp_com', { alias: z.string(), actionDelay: z.number() }),
  placed('CoinPoint_mc', { alias: z.string(), delay: z.number() }),
  placed('Passenger_com', { alias: z.string(), lowerLimit: z.number(), upperLimit: z.number() }),
  plain('GroundBox_com'),
  plain('GroundCircle_com'),
  plain('Stopper_com'),
  plain('HouseFront01_mc'),
  plain('KeyPoint_mc'),
  plain('SpawnPoint_mc'),
  plain('ArrowPoint_com'),
  plain('Barrel_com'),
  plain('BoxBig_com'),
  plain('BoxSmall_com'),
  plain('Coin_mc'),
  plain('Fuel_mc'),
  plain('Trophy_mc'),
  plain('Shuttle01PassGreen_mc'),
]);
export type LevelObject = z.infer<typeof LevelObjectSchema>;

export const LevelSchema = z.strictObject({
  /** `Level01`. */
  name: z.string().regex(/^Level\d\d$/),
  /** `Level01Physic_mc`. */
  clip: z.string().regex(/^Level\d\dPhysic_mc$/),
  /** Sorted by `depth`. */
  objects: z.array(LevelObjectSchema),
});
export type LevelData = z.infer<typeof LevelSchema>;

/**
 * Model / ragdoll objects: physics shapes and joints (all named, all parameters required)
 * plus the unnamed debris graphics (`*Frag0N_mc`, `RockFragment0N_mc`, `FragBandage_mc`) that ragdolls place.
 */
const FragmentSchema = z.strictObject({
  ...PlacedBaseShape,
  cls: z.string().regex(/^(Shuttle0\dFrag0\d|RockFragment0\d|FragBandage)_mc$/),
  props: NoProps,
});

export const ModelObjectSchema = z.union([
  placed('CircleShape_com', ShapeProps),
  placed('RectShape_com', ShapeProps),
  placed('RevoluteJoint_com', {
    alias: z.string(),
    lowerAngle: z.number(),
    upperAngle: z.number(),
    enableLimit: z.boolean(),
    motorSpeed: z.number(),
    maxMotorTorque: z.number(),
    enableMotor: z.boolean(),
    weakness: z.number(),
    bodyAliasA: z.string(),
    bodyAliasB: z.string(),
  }),
  placed('PrismaticJoint_com', {
    alias: z.string(),
    lowerTranslation: z.number(),
    upperTranslation: z.number(),
    enableLimit: z.boolean(),
    motorSpeed: z.number(),
    maxMotorForce: z.number(),
    enableMotor: z.boolean(),
    weakness: z.number(),
    bodyAliasA: z.string(),
    bodyAliasB: z.string(),
  }),
  FragmentSchema,
]);
export type ModelObject = z.infer<typeof ModelObjectSchema>;

/** `Shuttle01Model_mc` -> objects (sorted by depth). 53 clips: *Model_mc, *Ragdoll_mc and *Ragdoll0N_mc. */
export const ModelsSchema = z.record(
  z.string().regex(/(Model|Ragdoll(\d\d)?)_mc$/),
  z.strictObject({ objects: z.array(ModelObjectSchema) }),
);
export type ModelsData = z.infer<typeof ModelsSchema>;

// ---------------------------------------------------------------- sounds.json (docs/02-extraction-pipeline.md §5)
// Written by tools/extract/sounds.ts. `id` is the index in the array (sorted by name); `samples` is the length of
// the audio file per channel, i.e. the SWF sampleCount minus `trimStartSamples` (leading MP3 silence cut from loops).

export const SoundEntrySchema = z.strictObject({
  id: IntSchema.nonnegative(),
  name: z.string().regex(/^Snd\w+$/),
  /** Path under assets/, e.g. `sfx/SndEngineGas.ogg`. */
  file: z.string().regex(/^sfx\/Snd\w+\.(ogg|flac)$/),
  loop: z.boolean(),
  rate: IntSchema.positive(),
  channels: z.union([z.literal(1), z.literal(2)]),
  samples: IntSchema.positive(),
  trimStartSamples: IntSchema.nonnegative(),
});
export type SoundEntry = z.infer<typeof SoundEntrySchema>;

export const SoundsSchema = z.array(SoundEntrySchema);
export type SoundsData = z.infer<typeof SoundsSchema>;

// ---------------------------------------------------------------- fonts / missions / texts / effects
// Written by tools/extract/data.ts from reference/data/*.xml (docs/02-extraction-pipeline.md §6).
// Fonts are converted to a game format (numbers), everything else is the generic xmlToJson tree
// (docs/04-porting-guide.md §5): attributes -> string fields, repeated children -> arrays.

/** assets/data/fonts/fontXX.json; `chars` keep the XML order (Font.chars indexes frames by it). */
export const FontCharSchema = z.strictObject({
  name: z.string().min(1),
  x: IntSchema,
  y: IntSchema,
  w: IntSchema,
  h: IntSchema,
  /** Optional in Font.parseAtlasXML (NaN -> 0); absent from the shipped fonts. */
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
});
export const FontSchema = z.strictObject({
  name: z.string().min(1),
  charInterval: IntSchema,
  chars: z.array(FontCharSchema).min(1),
});
export type FontData = z.infer<typeof FontSchema>;

/** `<SubProp name="" value=""/>` — a name/value pair, both strings. */
export const SubPropSchema = z.strictObject({ name: z.string(), value: z.string() });

/** missions.json = `<MissionsData>`: `Mission` -> `SubProp` list (MissionManager.loadMissionFrom). */
export const MissionsSchema = z.strictObject({
  Mission: z.array(z.strictObject({ SubProp: z.array(SubPropSchema).min(1) })).min(1),
});
export type MissionsData = z.infer<typeof MissionsSchema>;

/** texts.json = `<TextData lang="ru">`: `SubText` id -> value (Text.loadXML). */
export const TextsSchema = z.strictObject({
  lang: z.string(),
  SubText: z.array(z.strictObject({ id: z.string().min(1), value: z.string() })).min(1),
});
export type TextsData = z.infer<typeof TextsSchema>;

/** effects.json = `<EffectProject>` (AntEffectManager.loadXML). */
export const EffectsSchema = z.strictObject({
  /** Leftover of the effect editor (`resourcesSWF`, `backgroundClip`). */
  PropertiesList: z.array(z.strictObject({ Property: z.array(SubPropSchema) })).length(1),
  /** Clips whose frames AntEffectManager caches; they live in the main SWF. */
  CacheList: z.array(z.strictObject({ Clip: z.array(z.strictObject({ name: z.string() })).min(1) })).length(1),
  Effect: z
    .array(
      z.strictObject({
        name: z.string().regex(/_eff$/),
        EffectProperty: z.array(z.strictObject({ name: z.string(), SubProp: z.array(SubPropSchema).min(1) })).min(1),
      }),
    )
    .min(1),
});
export type EffectsData = z.infer<typeof EffectsSchema>;
