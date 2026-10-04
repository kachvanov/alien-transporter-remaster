// Not a port. The initial state of a replay run (T4.1): the game state that starts the level of the replay at once, in the mode
// and with the ship of the replay (`GameState.debugStartLevel`, the dev entry `--start-level=LevelNN`). The headless runner
// (headless.ts: `runReplay`) and the recording of the GameLoop (`recordStart`) both start their runs with it, so a replay that
// was recorded in the game plays the same in Node.

import type { AntState } from '../engine/core/AntState';
import type { Ctor } from '../engine/utils/types';
import { PlayerData } from '../game/data/PlayerData';
import { G } from '../game/G';
import { GameState } from '../game/states/GameState';
import type { Replay } from './replay';

export function makeReplayState(aReplay: Pick<Replay, 'level' | 'casualMode' | 'ship'>): Ctor<AntState> {
  const { level, casualMode, ship } = aReplay;
  return class ReplayState extends GameState {
    override create(): void {
      super.create();
      G.gameData.casualMode = casualMode;
      const data = G.gameData.getPlayerData(PlayerData.PLAYER1) as PlayerData;
      data.shuttleKind = ship.shuttleKind >>> 0;
      data.shuttleColor = ship.shuttleColor >>> 0;
      data.engineKind = ship.engineKind >>> 0;
      data.engineColor = ship.engineColor >>> 0;
      this.debugStartLevel(level);
    }
  };
}
