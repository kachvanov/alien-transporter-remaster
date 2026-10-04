// Not a port (T3.4, DEVIATION: online): "Host game". On entering the screen the renderer starts the WebSocket server and
// the UDP beacon (OnlineBridge.send({k:'hostOpen'}), docs/03 §2, §7); the screen shows the IPv4 addresses of the machine
// and the port, then who connected. START goes on to the level selection (the game then goes as usual, the client is Player2),
// STOP and Back stop the server and the beacon.

import type { AntButton } from '../../engine/core/AntButton';
import type { Label } from '../fonts/Label';
import { OnlineBridge } from '../online/OnlineBridge';
import { MenuSystem } from '../systems/MenuSystem';
import {
  ACTION_X,
  BACK_X,
  BUTTON_ROW_Y,
  OnlineScreenBase,
  TEXT_COLOR,
  TEXT_ERROR_COLOR,
  TEXT_WHITE,
} from './OnlineScreenBase';

/** The lines of addresses that fit the screen. */
const MAX_ADDRESS_LINES = 3;

export class HostScreen extends OnlineScreenBase {
  private _title: Label | null = null;
  private _hint: Label | null = null;
  private _addresses: Label[] = [];
  private _status: Label | null = null;
  private _version = -1;
  private _opened = false;
  /** START was pressed: the server stays up for the game. */
  private _started = false;

  override create(): void {
    super.create();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'MainMenuBG_mc']);
    this._tm.addPause(0.15);
    this._title = this.makeLabel(400, 316, 'HOST GAME');
    this._hint = this.makeLabel(400, 350, 'YOUR ADDRESS', 'font02', 'center', TEXT_COLOR);
    for (let i = 0; i < MAX_ADDRESS_LINES; i++) {
      this._addresses.push(this.makeLabel(400, 370 + i * 26, ' ', 'font01'));
    }

    this._status = this.makeLabel(400, 456, ' ', 'font01', 'center', TEXT_COLOR);
    this.addButton(BACK_X, BUTTON_ROW_Y, 'BtnCancel_mc', 'STOP', this.onClickStop, false, false);
    this.addButton(ACTION_X, BUTTON_ROW_Y, 'BtnPlay_mc', 'START', this.onClickStart, true, false);
    this._tm.addPause(0.25);
    this.playMenuMusic();
    OnlineBridge.resetHost();
    OnlineBridge.send({ k: 'hostOpen' });
    this._opened = true;
    this.refresh();
  }

  override destroy(): void {
    if (!this._started) {
      this.closeHost();
    }

    this._addresses.length = 0;
    this._title = null;
    this._hint = null;
    this._status = null;
    super.destroy();
  }

  override update(): void {
    super.update();
    if (this._version != OnlineBridge.version) {
      this.refresh();
    }
  }

  protected override onEscape(): void {
    this.stop();
  }

  /** The addresses and the state of the host as the renderer reported them. */
  private refresh(): void {
    this._version = OnlineBridge.version;
    const host = OnlineBridge.host;
    const lines = host.addresses.slice(0, MAX_ADDRESS_LINES).map((a) => `${a}:${host.port}`);
    if (host.status == 'waiting' || host.status == 'connected') {
      if (lines.length == 0) {
        lines.push('NO NETWORK ADDRESS');
      } else if (host.addresses.length > MAX_ADDRESS_LINES) {
        lines[MAX_ADDRESS_LINES - 1] += ' ...';
      }
    }

    for (let i = 0; i < this._addresses.length; i++) {
      this.setLabel(this._addresses[i] as Label, lines[i] ?? '', TEXT_WHITE);
    }

    const status = this._status as Label;
    switch (host.status) {
      case 'connected':
        this.setLabel(status, 'PLAYER 2 CONNECTED: ' + shortName(host.peerName), TEXT_WHITE);
        break;
      case 'waiting':
        this.setLabel(status, 'WAITING FOR PLAYER...', TEXT_COLOR);
        break;
      case 'error':
        this.setLabel(status, host.message != '' ? host.message.toUpperCase() : 'CANNOT START THE HOST', TEXT_ERROR_COLOR);
        break;
      default:
        this.setLabel(status, 'STARTING...', TEXT_COLOR);
    }
  }

  private closeHost(): void {
    if (this._opened) {
      this._opened = false;
      OnlineBridge.send({ k: 'hostClose' });
      OnlineBridge.resetHost();
    }
  }

  private onClickStart = (_aButton: AntButton): void => {
    void _aButton;
    if (this._started) {
      return;
    }

    this._started = true;
    OnlineBridge.send({ k: 'hostBegin' }); // the game of two players: the client is Player2 (sim/GameLoop.ts)
    this.menu.switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
  };

  private onClickStop = (_aButton: AntButton): void => {
    void _aButton;
    this.stop();
  };

  private stop(): void {
    if (this._started) {
      return;
    }

    this.closeHost();
    this.menu.switchScreen(MenuSystem.ONLINE_SCREEN);
  }
}

/** The name of the other player as a line of the status: capitals, no longer than 16 chars. */
function shortName(aName: string): string {
  const name = aName.trim().toUpperCase();
  return name == '' ? '?' : name.length > 16 ? name.substring(0, 16) : name;
}
