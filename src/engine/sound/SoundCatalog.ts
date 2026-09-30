// Not a port. The registry of the sounds of the game (assets/sounds.json, docs/02 §5) for the simulation.
// In the original a sound is a `flash.media.Sound` (an embedded class); here it is the metadata of the file:
// the id that goes into the Frame and the length that the simulation needs to know when a channel ends
// (Event.SOUND_COMPLETE, AntSoundManager.isPlaying()).

import { AssetRegistry } from '../assets/AssetRegistry';
import { SoundsSchema, type SoundEntry } from '../assets/schemas';

export interface SoundInfo {
  /** Index in sounds.json: the `soundId` of the Frame. */
  readonly id: number;
  /** `SndHitBox01` */
  readonly name: string;
  /** The sound is looped by the original (played with loops > 1). The AudioEngine loops such buffers. */
  readonly loop: boolean;
  readonly rate: number;
  readonly samples: number;
  /** Length of one pass, ms. */
  readonly durationMs: number;
}

export class SoundCatalog {
  private readonly _byName = new Map<string, SoundInfo>();
  private readonly _byId = new Map<number, SoundInfo>();

  constructor(aEntries: readonly Pick<SoundEntry, 'id' | 'name' | 'loop' | 'rate' | 'samples'>[]) {
    for (const e of aEntries) {
      const info: SoundInfo = {
        id: e.id,
        name: e.name,
        loop: e.loop,
        rate: e.rate,
        samples: e.samples,
        durationMs: (e.samples / e.rate) * 1000,
      };
      this._byName.set(info.name, info);
      this._byId.set(info.id, info);
    }
  }

  /** The catalog of the loaded `AssetRegistry.current`, or null when sounds.json is not loaded. */
  static fromRegistry(): SoundCatalog | null {
    const registry = AssetRegistry.current;
    if (registry == null) {
      return null;
    }
    try {
      return new SoundCatalog(SoundsSchema.parse(registry.getSounds()));
    } catch {
      return null;
    }
  }

  get(aName: string): SoundInfo | null {
    return this._byName.get(aName) ?? null;
  }

  getById(aId: number): SoundInfo | null {
    return this._byId.get(aId) ?? null;
  }

  get size(): number {
    return this._byId.size;
  }
}
