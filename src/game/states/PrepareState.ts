// Port of ru/alientransporter/states/PrepareState.as
//
// The original is a preloader: it sets the size of the game, makes the camera with the preloader clip, caches all the
// graphics with a progress bar (AntAssetLoader), shows the Play button, the transition and the intro of the sponsor
// (AGIntro_mc, the advertisement ABSWrapper/ABSFrame_mc), then `AntG.switchState(new GameState())`.
//
// DEVIATION (docs/tasks/T2.6, docs/04-porting-guide.md section 4): there is nothing to cache (the atlases are loaded by
// the renderer), so no preloader camera, no progress bar, no Play button; the sequence of the initialisation stays and
// the state switches to the GameState at once, the first screen of which is the main menu.
// DEVIATION: sponsor removed: AGIntro_mc, the advertisement of ABSWrapper, `AntG.openUrl(G.MORE_GAMES_URL)` of the intro.
// DEVIATION: `AntG.frameRate = 28` of the intro is ignored (the simulation has a fixed step, docs/04 section 4).
// DEVIATION: the switch is made in `create()` (the original switches from the click on the Play button): the
// camera of the game is made by GameState.create().
// DEVIATION: `loadEmbeddedXML(XmlEffects)` takes the effects of assets/data/effects.json from the AssetRegistry
// (AntEffectManager.loadEmbeddedXML).

import { AntG } from '../../engine/core/AntG';
import { AntState } from '../../engine/core/AntState';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import { AntPoint } from '../../engine/utils/AntPoint';
import { Config } from '../Config';
import { GameState } from './GameState';

export class PrepareState extends AntState {
  constructor() {
    super();
  }

  override create(): void {
    AntG.width = 800;
    AntG.height = 600;
    AntG.widthHalf = 400;
    AntG.heightHalf = 300;
    AntG.waterMark[0] = Config.GAME_NAME + ' ' + Config.GAME_VERSION;
    AntG.waterMarkPosition = new AntPoint(280, 600 - 20);
    AntG.fixedElapsed = true;
    AntG.maxElapsed = 0.0333;
    AntG.timeScale = 1;
    AntG.debugMode = Config.DEBUG_MODE;
    super.create();
    AntEffectManager.getInstance().loadEmbeddedXML();
    AntG.switchState(new GameState());
  }
}
