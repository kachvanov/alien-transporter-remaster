<div align="center">

# 👽 Alien Transporter Remaster

**An unofficial remaster of the Flash game Alien Transporter for macOS and Windows, with two-player play over a local network.**

![macOS Apple Silicon](https://img.shields.io/badge/macOS-Apple%20Silicon-black?logo=apple)
![Windows 10 x64](https://img.shields.io/badge/Windows-10%20x64-0078D6?logo=windows)
![Electron](https://img.shields.io/badge/Electron-TypeScript%20%2B%20PixiJS-47848F?logo=electron)
![LAN multiplayer](https://img.shields.io/badge/LAN-2%20players-success)

</div>

Alien Transporter is an arcade game by Anton Karlov (2016): you pilot a rocket shuttle through caves and ferry alien passengers around, watching your fuel and dodging obstacles. This version ports the original Flash game **v1.3.0** to a modern engine so that it runs on an ordinary computer again.

The goal of the project is **maximum fidelity to the original**: the same levels, the same physics and the same formulas. Only things the original did not have have been added on top.

## Contents

- [What's new compared to the original](#whats-new-compared-to-the-original)
- [Important: the game does not include the original assets](#important-the-game-does-not-include-the-original-assets)
- [How to get the game](#how-to-get-the-game)
- [Installing and running](#installing-and-running)
- [Controls](#controls)
- [Two players on one computer](#two-players-on-one-computer)
- [LAN play](#lan-play)
- [If you can't connect](#if-you-cant-connect)
- [Saves](#saves)
- [Credits and rights](#credits-and-rights)

## What's new compared to the original

| | |
|---|---|
| 🌐 **LAN play** | Two players on the same Wi-Fi or wired network. Games are discovered automatically, like "LAN games" in Minecraft; you can also enter an IP address by hand. Mac and Windows can play with each other. |
| 🎞️ **Smooth picture** | GPU rendering at 60 or 120 Hz instead of 35 frames per second. **Classic 35 fps** mode brings back the feel of the original. |
| 🖼️ **HD graphics** | Sprites at 1x, 2x and 3x resolution (Retina and 4K). The set is chosen automatically to suit your screen and memory. |
| 💾 **Saves in a file** | Progress is stored in a plain JSON file next to the settings, not in Flash storage. |

The physics and game logic (Box2D 2.1a) are ported without any "improvements": gameplay, balance and timings match the original.

## Important: the game does not include the original assets

The graphics, sounds, music and levels belong to Anton Karlov. **They are not in this repository, and there are no ready-made builds here.** You need to build the game yourself from your own copy of the original `alien-transporter.swf` file (Alien Transporter **v1.3.0**). The build extracts the images, sounds and level data from it and puts them into local folders that are not tracked by git.

So, please:

- **do not publish** the built `dmg`, `exe` or the `assets/` folders anywhere public: they contain someone else's material;
- share only this repository with friends, not the builds.

## How to get the game

### What you need

- the original file **`alien-transporter.swf`** (v1.3.0), which you already have;
- [Node.js](https://nodejs.org) 22 or newer;
- [Java](https://adoptium.net) 17 and [ffmpeg](https://ffmpeg.org) (needed once, to unpack the SWF).

On a Mac all of this can be installed with [Homebrew](https://brew.sh): `brew install node openjdk@17 ffmpeg`.

### Steps

```bash
git clone https://github.com/<your-account>/alien-transporter-remaster.git
cd alien-transporter-remaster
npm ci
cp .env.example .env     # set ORIGINAL_SWF to the path of your alien-transporter.swf
npm run extract          # extracts graphics, sounds and levels from the SWF into local folders
```

Then pick an option:

| What you want | Command | Result |
|---|---|---|
| Just play right away | `npm run dev` | the game opens in a window |
| A Mac app | `npm run build:mac` | `dist/Alien Transporter Remaster-0.1.0-<hash>-arm64.dmg` |
| A Windows 10 app | `npm run build:win` | in `dist/`: the installer `…Setup 0.1.0-<hash>.exe` and the portable `…0.1.0-<hash>.exe` |

The Windows installer can also be built on a Mac (on Apple Silicon this requires Rosetta 2: `softwareupdate --install-rosetta`). Building on Windows itself has not been tested yet.

## Installing and running

### macOS (Apple Silicon)

1. Open the built `.dmg` and drag **Alien Transporter Remaster** into **Applications**.
2. Launch the game by double-clicking it.

The app is signed only with an "ad-hoc" signature (there is no paid Apple certificate). If you copied it to another Mac and the system says the app is "damaged", run this in Terminal:

```bash
xattr -cr "/Applications/Alien Transporter Remaster.app"
```

The first time you play over the network, macOS will ask about access to the **local network**: click "Allow".

### Windows 10 (x64)

- **Installer** (`Alien Transporter Remaster Setup 0.1.0.exe`): run it, choose a folder and click "Install". Shortcuts are created automatically.
- **Portable** (`Alien Transporter Remaster 0.1.0.exe`): put it anywhere and run it; no installation needed.

The build is not signed with a certificate, so Windows will show the blue SmartScreen window: click **"More info" → "Run anyway"**. The first time you use **Online → Host Game**, Windows Defender will ask about access: tick **"Private networks"** and click "Allow".

The Windows build does not include the largest image set (3x, for 4K screens), so that it does not take up extra memory. If the picture does not appear on a 4K monitor, start the game with the `--tier=2x` flag: shortcut → Properties → in the "Target" field, add a space and `--tier=2x` after the path.

## Controls

| Action | Keys |
|---|---|
| Player 1 | arrows: ↑ thrust, ← and → rotate |
| Player 2 | **W** thrust, **A** and **D** rotate |
| Pause | **P** or **Esc** |
| Full screen | **F11** (also Alt+Enter; on Mac also Ctrl+Cmd+F) |
| Remaster settings | **F2**: "Classic 35 fps" mode, image set auto / 1x / 2x / 3x (a change takes effect after a restart) |
| Volume down / up | **-** and **=** (the **+** key), also **Numpad -** and **Numpad +**; hold to change faster. Works on every screen, including the main menu and the LAN lobby; a note "Volume 60%" appears for a moment |
| Mute / unmute | **`** (the key under Esc) or **F8** |
| Precise volume | **F2** → "Master volume": arrows (Shift = bigger steps), the bar with the mouse, Enter = mute. The volume is remembered between launches |
| Performance counter | **F3**: FPS, simulation tick time, traffic, network |

Player keys can be changed in the game, in the **Garage**. Progress is saved when you leave the Garage with the Play and Back buttons, as in the original.

## Two players on one computer

The first player starts a level as usual. To bring in the second player, **the second player presses W during the level**: the second ship enters the game. From then on it flies with W / A / D, and the first one with the arrows.

## LAN play

Two people play: the **host** (player 1) and the **client** (player 2). You need:

- both computers on the same Wi-Fi or wired network;
- the same version of the game on both;
- Mac and Windows can play with each other in any combination.

1. **Host:** main menu → **Online** → **Host Game**. The game shows addresses like `192.168.x.x:47020`. The **TEST** button checks that the game is listening on the port on the network addresses.
2. **Client:** **Online** → **Join Game**. The host appears in the list by itself, usually within 1–2 seconds: select it and click **Connect**. If there is no list, enter the host's address from the Host screen by hand.
3. The **host** clicks **START** and chooses a level. The menu and level selection always belong to the host.
4. The **client** enters the level by pressing thrust. The second player's ship appears in the host's game.
5. Pause from the client (**P**) pauses and unpauses the game on the host. **Esc** on the client opens the exit prompt. If the client closes the window or loses the network, the host keeps playing. If the host closes the game, the client sees a message and returns to the menu.

The game uses **TCP port 47020** (the game itself) and **UDP port 47021** (auto-discovery).

## If you can't connect

<details>
<summary><b>Common causes</b></summary>

- Both machines must be on the **same** Wi-Fi network, not one on the main and one on a "guest" network. Guest and public networks often block communication between devices ("client isolation"). Connect to the main network or to a phone hotspot.
- **The game version is the same** on both. In the Join list, a host with a different version is labelled "DIFFERENT VERSION" and cannot be connected to.
- If the game is not in the list but connecting by address works, then auto-discovery (UDP, port 47021) is being blocked. You can still play by entering the address manually.

</details>

<details>
<summary><b>Windows</b></summary>

1. The network must be **Private**: Settings → Network & Internet → Wi-Fi → network properties → "Network profile" → **Private**.
2. The firewall must allow the game on **Private networks**. If you refused the first time you used Host Game, the prompt will not appear again: Settings → Windows Security → Firewall & network protection → "Allow an app through firewall" → find Alien Transporter Remaster (for the portable build, Electron) → tick **Private**.
3. Check the port from Windows to the host (substitute its IP):

   ```powershell
   Test-NetConnection 192.168.0.5 -Port 47020
   ```

   You should see `TcpTestSucceeded : True`.

</details>

<details>
<summary><b>macOS</b></summary>

1. System Settings → Privacy & Security → **Local Network** → turn on the switch for **Alien Transporter Remaster**. Without it the game cannot see other machines.
2. If the macOS firewall is on, click "Allow incoming connections" the first time you use Host Game.
3. Check the port from the Mac to the host:

   ```bash
   nc -vz 192.168.0.5 47020
   ```

   A "succeeded" reply means the port is open.

</details>

The TEST button on the Host screen does not show whether a firewall is blocking connections from other machines. For that, use `Test-NetConnection` or `nc` from the second computer.

## Saves

| OS | Folder |
|---|---|
| macOS | `~/Library/Application Support/Alien Transporter Remaster/` |
| Windows | `%APPDATA%\Alien Transporter Remaster\` |

- `save.json`: game progress (completed levels, ships and their settings, keys);
- `settings.json`: remaster settings (F2, including the master volume) and the window position.

**To reset progress:** close the game and delete `save.json` (better to keep a copy first). If the file is corrupted, the game renames it to `save.corrupt-<time>.json` and starts over; the old one stays alongside.

## Credits and rights

- The original game **Alien Transporter** is © Anton Karlov, 2016. The graphics, sounds, music and levels are his property.
- This is an **unofficial** non-commercial fan project. It is not affiliated with the author of the original and is not endorsed by them.
- The repository does not contain any files from the original game and is not intended for distributing them. Do not publish the built apps or the extracted assets.
- Physics engine: [box2dweb](https://www.npmjs.com/package/box2dweb) 2.1a (a port of Box2D). Graphics by [PixiJS](https://pixijs.com), shell by [Electron](https://www.electronjs.org).
- If you are the author of the original or a rights holder and want the project changed or removed, write via an issue or a private message and it will be done.
