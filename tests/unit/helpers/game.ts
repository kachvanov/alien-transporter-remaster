// Test helper: a game as the real one starts it (Anthill -> GameState.create -> G.init), with or without the systems
// that GameState.create adds. The assets must be loaded before (helpers/assets.ts: the fonts and the manifest are read
// by Fonts.init(), the levels by LevelCore).

import { Anthill } from '../../../src/engine/core/Anthill';
import { GameState } from '../../../src/game/states/GameState';
import { G } from '../../../src/game/G';

/** The real state, but without the 17 `addSystem` calls: the test adds the systems it wants. */
export class BareGameState extends GameState {
  protected override addSystems(): void {}
}

/** The initial state of a headless run that plays a level at once (`--start-level=Level01`: debugStartLevel). */
export class Level01State extends GameState {
  override create(): void {
    super.create();
    this.debugStartLevel('Level01');
  }
}

export interface StartGameOptions {
  /** true: the systems of GameState.as (default false: none, like the tests of the single systems need). */
  systems?: boolean;
}

/**
 * New game: stops the Box2D world of the previous one, `new Anthill` (AntG.init: new plugin manager, keyboard, sounds,
 * cameras and clock), then the state is created like Anthill.switchState does it. Returns the state (`G.gameState`).
 */
export function startGame(aOptions: StartGameOptions = {}): GameState {
  if (G.physics != null) {
    G.physics.stop();
  }

  const anthill = new Anthill(null, false);
  const state = aOptions.systems === true ? new GameState() : new BareGameState();
  anthill.switchState(state);
  return state;
}
