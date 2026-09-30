// Port of ru/alientransporter/Config.as

import { AvailKeys } from './AvailKeys';
import { DebugSettings } from './DebugSettings';

export class Config {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly GAME_NAME = 'Alien Transporter';
  static readonly GAME_VERSION = '1.3.0 - Feb 2, 2016';
  static readonly FRAME_RATE = 35; // int
  static readonly DEBUG_MODE = false;
  static readonly STREAM_SOUNDS = false;
  static readonly STREAM_MUSIC = false;

  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  static debugSettings: DebugSettings = new DebugSettings();
  static availKeys: AvailKeys = new AvailKeys();

  /** Key names as in AntKeyboard.addKey of the original ("UP", "W", "SPACEBAR", "ESC", ...). */
  static keyConfig = 'G';
  static keyPause1 = 'P';
  static keyPause2 = 'ESC';
  static keyAction1 = 'SPACEBAR';
  static keyAction2 = 'ENTER';
  static keyP1Gas = 'UP';
  static keyP1Left = 'LEFT';
  static keyP1Right = 'RIGHT';
  static keyP2Gas = 'W';
  static keyP2Left = 'A';
  static keyP2Right = 'D';
  static defLives = 3; // int

  constructor() {
    // super();
  }
}
