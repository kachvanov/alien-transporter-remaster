// Not a port (T3.4, DEVIATION: online): "Join game". The list of the games that the beacons of the LAN announce (up to
// five lines: the name of the host, its address, the state; "different version" is grey), a click on a line connects;
// below it the field in which an address `ip` or `ip:port` is typed (Enter = Connect). The renderer owns the network:
// the screen only sends `scanOpen` / `scanClose` and `joinRequest` (OnlineBridge) and shows what comes back.
//
// A failed or a lost game brings the player back here: the renderer restarts the worker and opens this screen with the
// reason (OnlineBridge.joinFailure).

import { AntG } from '../../engine/core/AntG';
import type { AntButton } from '../../engine/core/AntButton';
import type { Label } from '../fonts/Label';
import type { OnlineGame } from '../online/OnlineBridge';
import { formatJoinAddress, JOIN_FAILURE_TEXTS, OnlineBridge, parseJoinAddress } from '../online/OnlineBridge';
import { MenuSystem } from '../systems/MenuSystem';
import { TextInputView } from '../ui/TextInputView';
import {
  ACTION_X,
  BACK_X,
  BUTTON_ROW_Y,
  OnlineScreenBase,
  TEXT_COLOR,
  TEXT_DIM_COLOR,
  TEXT_ERROR_COLOR,
  TEXT_WHITE,
} from './OnlineScreenBase';
import { G } from '../G';

/** Lines of the list of games. */
export const MAX_GAME_LINES = 5;
const LIST_TOP = 338;
const LIST_STEP = 19;
const LIST_LEFT = 150;
const LIST_RIGHT = 650;
const COLUMN_NAME = 170;
const COLUMN_ADDRESS = 440;
const COLUMN_STATE = 630;
/** A connection that has not answered after this many seconds is given up (the renderer restarts the worker earlier). */
const CONNECT_TIMEOUT = 20;

interface GameLine {
  name: Label;
  address: Label;
  state: Label;
}

export class JoinScreen extends OnlineScreenBase {
  private _lines: GameLine[] = [];
  private _games: OnlineGame[] = [];
  private _input: TextInputView | null = null;
  private _note: Label | null = null;
  private _hint: Label | null = null;
  private _version = -1;
  private _selected = -1;
  private _busy = 0;
  private _notice: { text: string; color: number } | null = null;
  private _scanning = false;

  override create(): void {
    super.create();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'MainMenuBG_mc']);
    this._tm.addPause(0.15);
    this.makeLabel(400, 304, 'JOIN GAME');
    for (let i = 0; i < MAX_GAME_LINES; i++) {
      const y = LIST_TOP + i * LIST_STEP;
      this._lines.push({
        name: this.makeLabel(COLUMN_NAME, y, ' ', 'font02', 'left'),
        address: this.makeLabel(COLUMN_ADDRESS, y, ' ', 'font02', 'center'),
        state: this.makeLabel(COLUMN_STATE, y, ' ', 'font02', 'right'),
      });
    }

    this._note = this.makeLabel(400, LIST_TOP + MAX_GAME_LINES * LIST_STEP + 1, ' ', 'font02', 'center', TEXT_COLOR);
    const input = G.gameState.layerMenu.recycle(TextInputView) as TextInputView;
    input.revive();
    input.create(250, 458, 300);
    input.text = OnlineBridge.lastJoinAddress;
    input.eventChange.add(this.onTextChange);
    this._input = input;
    this._hint = this.makeLabel(400, 492, 'IP OR IP:PORT, ENTER TO CONNECT', 'font02', 'center', TEXT_DIM_COLOR);
    this.addButton(BACK_X, BUTTON_ROW_Y, 'BtnCancel_mc', 'BACK', this.onClickBack, false, false);
    this.addButton(ACTION_X, BUTTON_ROW_Y, 'BtnApply_mc', 'CONNECT', this.onClickConnect, true, false);
    this._tm.addPause(0.25);
    this.playMenuMusic();

    const failure = OnlineBridge.joinFailure;
    OnlineBridge.joinFailure = null;
    if (failure != null) {
      this._notice = { text: JOIN_FAILURE_TEXTS[failure], color: TEXT_ERROR_COLOR };
    }

    OnlineBridge.games = [];
    OnlineBridge.scanError = null;
    OnlineBridge.send({ k: 'scanOpen' });
    this._scanning = true;
    this.refresh();
  }

  override destroy(): void {
    this.closeScan();
    if (this._input != null) {
      this._input.kill();
      this._input = null;
    }

    this._lines.length = 0;
    this._note = null;
    this._hint = null;
    super.destroy();
  }

  override update(): void {
    super.update();
    if (this._busy > 0) {
      this._busy -= AntG.elapsed;
      if (this._busy <= 0) {
        this._busy = 0;
        this._notice = { text: JOIN_FAILURE_TEXTS.failed, color: TEXT_ERROR_COLOR };
        this.refresh();
      }

      return; // (the screen waits for the renderer)
    }

    if (this._version != OnlineBridge.version) {
      this.refresh();
    }

    this.updateList();
  }

  protected override onEscape(): void {
    this.back();
  }

  /** Mouse and arrow keys of the list. */
  private updateList(): void {
    const shown = this._games.length < MAX_GAME_LINES ? this._games.length : MAX_GAME_LINES;
    if (shown == 0) {
      return;
    }

    let changed = false;
    if (AntG.keys.isPressed('DOWN')) {
      this._selected = (this._selected + 1) % shown;
      changed = true;
    } else if (AntG.keys.isPressed('UP')) {
      this._selected = this._selected <= 0 ? shown - 1 : this._selected - 1;
      changed = true;
    }

    if (changed) {
      const game = this._games[this._selected] as OnlineGame;
      (this._input as TextInputView).text = formatJoinAddress(game.ip, game.port, OnlineBridge.port);
      this.refresh();
    }

    const mouse = AntG.mouse.getScreenPosition();
    if (mouse.x >= LIST_LEFT && mouse.x <= LIST_RIGHT) {
      const line = Math.floor((mouse.y - LIST_TOP) / LIST_STEP);
      if (line >= 0 && line < shown && mouse.y >= LIST_TOP) {
        if (line != this._selected) {
          this._selected = line;
          this.refresh();
        }

        if (AntG.mouse.isReleased() && canJoin(this._games[line] as OnlineGame)) {
          const game = this._games[line] as OnlineGame;
          this.connect(game.ip, game.port);
        }
      }
    }
  }

  private refresh(): void {
    this._version = OnlineBridge.version;
    this._games = OnlineBridge.games.slice(0, MAX_GAME_LINES);
    if (this._selected >= this._games.length) {
      this._selected = -1;
    }

    for (let i = 0; i < MAX_GAME_LINES; i++) {
      const line = this._lines[i] as GameLine;
      const game = this._games[i];
      if (game == null) {
        this.setLabel(line.name, '');
        this.setLabel(line.address, '');
        this.setLabel(line.state, '');
        continue;
      }

      const color = canJoin(game) ? (i == this._selected ? TEXT_WHITE : TEXT_COLOR) : TEXT_DIM_COLOR;
      this.setLabel(line.name, (i == this._selected ? '> ' : '') + game.hostName.substring(0, 20), color);
      this.setLabel(line.address, `${game.ip}:${game.port}`, color);
      this.setLabel(line.state, stateOf(game), color);
    }

    const note = this._note as Label;
    if (this._busy > 0) {
      this.setLabel(note, 'CONNECTING...', TEXT_WHITE);
    } else if (this._notice != null) {
      this.setLabel(note, this._notice.text, this._notice.color);
    } else if (OnlineBridge.scanError != null) {
      this.setLabel(note, 'CANNOT SEARCH THE NETWORK', TEXT_ERROR_COLOR);
    } else if (this._games.length == 0) {
      this.setLabel(note, 'SEARCHING FOR GAMES...', TEXT_COLOR);
    } else {
      this.setLabel(note, ' ');
    }
  }

  private onTextChange = (_aText: string): void => {
    void _aText;
    if (this._notice != null) {
      this._notice = null;
      this.refresh();
    }
  };

  private closeScan(): void {
    if (this._scanning) {
      this._scanning = false;
      OnlineBridge.send({ k: 'scanClose' });
    }
  }

  private connect(aHost: string, aPort: number): void {
    if (this._busy > 0) {
      return;
    }

    this._notice = null;
    this._busy = CONNECT_TIMEOUT;
    this.refresh();
    OnlineBridge.send({ k: 'joinRequest', host: aHost, port: aPort });
  }

  private back(): void {
    this.closeScan();
    this.menu.switchScreen(MenuSystem.ONLINE_SCREEN);
  }

  private onClickBack = (_aButton: AntButton): void => {
    void _aButton;
    if (this._busy == 0) {
      this.back();
    }
  };

  private onClickConnect = (_aButton: AntButton): void => {
    void _aButton;
    const address = parseJoinAddress((this._input as TextInputView).text, OnlineBridge.port);
    if (address == null) {
      this._notice = { text: 'INVALID ADDRESS', color: TEXT_ERROR_COLOR };
      this.refresh();
      return;
    }

    this.connect(address.host, address.port);
  };
}

function canJoin(aGame: OnlineGame): boolean {
  return aGame.buildHashMatches && aGame.status == 'waiting';
}

function stateOf(aGame: OnlineGame): string {
  if (!aGame.buildHashMatches) {
    return 'DIFFERENT VERSION';
  }

  return aGame.status == 'full' ? 'FULL' : 'WAITING';
}
