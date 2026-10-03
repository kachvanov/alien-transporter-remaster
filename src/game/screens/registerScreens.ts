// DEVIATION (ES module cycles): the `registerScreen(name, Class)` calls of the MenuSystem constructor of the original
// (ru/alientransporter/systems/MenuSystem.as), see systems/MenuSystem.ts. The game state imports this module.

import { MenuSystem } from '../systems/MenuSystem';
import { CreditsScreen } from './CreditsScreen';
import { GameScreen } from './GameScreen';
import { GarageScreen } from './GarageScreen';
import { LevelCompleteScreen } from './LevelCompleteScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { RestartLevelScreen } from './RestartLevelScreen';
import { SelectLevelScreen } from './SelectLevelScreen';

MenuSystem.screens[MenuSystem.MAIN_MENU_SCREEN] = MainMenuScreen;
MenuSystem.screens[MenuSystem.SELECT_LEVEL_SCREEN] = SelectLevelScreen;
MenuSystem.screens[MenuSystem.GARAGE_SCREEN] = GarageScreen;
MenuSystem.screens[MenuSystem.LEVEL_COMPLETE_SCREEN] = LevelCompleteScreen;
MenuSystem.screens[MenuSystem.GAME_SCREEN] = GameScreen;
MenuSystem.screens[MenuSystem.RESTART_LEVEL_SCREEN] = RestartLevelScreen;
MenuSystem.screens[MenuSystem.CREDITS_SCREEN] = CreditsScreen;
