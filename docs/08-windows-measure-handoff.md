# 08. Measurement on the Windows laptop (instructions for the Claude on that laptop)

You are Claude on a Windows 10 laptop (8 GB). The laptop's owner is helping to check a build of the game **Alien Transporter Remaster** (an Electron app) and to collect performance numbers. You do all the technical work; the owner is needed for clicks in Windows dialogs (SmartScreen, Firewall) and to **play** (live key presses are required). Node, npm, Java and the sources are **not needed**: a ready-made installer is used.

## Rules

- Work only in `C:\at-measure` and in the game's install folder. Change nothing in the system beyond the steps below.
- **Ask the owner** before installing, before launching the game, and before any change to Windows settings. Clicks in the SmartScreen and Firewall dialogs are made by **her**, not you.
- Do not send any files to the internet. Results go only to `C:\at-measure\`; the owner will forward them herself.
- Do not invent numbers. What was not measured, write "not measured".
- If something fails twice in a row, stop, show the command and its output, and ask the owner.

## What is next to it

`Alien Transporter Remaster Setup 0.1.0.exe` (≈233 MB) is the installer. The owner will tell you where it is (a flash drive/folder). Copy it to `C:\at-measure\`.

## Step 1. Machine parameters (read only)

In PowerShell:
```powershell
New-Item -ItemType Directory -Force C:\at-measure | Out-Null
Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
Get-CimInstance Win32_ComputerSystem | Select-Object @{n='RAM_GB';e={[math]::Round($_.TotalPhysicalMemory/1GB,1)}}
Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion
(Get-CimInstance Win32_OperatingSystem).Caption
```
Record the output in the report. Ask the owner to close heavy programs (a browser with lots of tabs, etc.); record what remained open.

## Step 2. Installation

1. Ask the owner for permission and run the installer `C:\at-measure\Alien Transporter Remaster Setup 0.1.0.exe`.
2. Windows will show the blue SmartScreen window: **the owner** clicks "More info" → "Run anyway" (the build is not signed).
3. Install with the default settings. Find the installed exe (usually the "Alien Transporter Remaster" shortcut on the desktop/in the Start menu; get the path from the shortcut: `(New-Object -ComObject WScript.Shell).CreateShortcut("<path to .lnk>").TargetPath`). Remember the path as `$exe`.

## Step 3. Measurement, Level11

Launch the game straight onto the level, with the 2x tier and a performance log (the log path is **absolute**):
```powershell
$exe = "<path to Alien Transporter Remaster.exe>"
Start-Process -FilePath $exe -ArgumentList '--start-level=Level11','--tier=2x','--perf-log=C:\at-measure\perf-l11.json'
```
If the game opened on the main menu rather than on the level, the flag did not work: the owner selects Level 11 in the menu; the log is still written (later note in the report "the menu got into the measurement").

The owner **plays for 90 seconds**: flies actively, burns fuel, blows up barrels, drops off passengers. If there is a second player, have them press **W** (the second player joins on this same laptop) and fly too. The measurement runs by itself, once per second.

While she plays, ask her **once** to press **F3** (the performance overlay) and read out/photograph/copy the lines: FPS, tier, vram, ram. You need to confirm that tier = **2x**. Then F3 again to hide it.

After 90 seconds ask her to close the game. The file `C:\at-measure\perf-l11.json` is written atomically after every line, nothing needs to be saved specially.

## Step 4. Measurement, Level13

The same thing:
```powershell
Start-Process -FilePath $exe -ArgumentList '--start-level=Level13','--tier=2x','--perf-log=C:\at-measure\perf-l13.json'
```
The owner plays for 90 seconds (rockets, sensors, fly actively, W for a second player if desired). Close the game.

## Step 5. Read the numbers

Node is not needed, read through PowerShell:
```powershell
foreach ($f in 'perf-l11','perf-l13') {
  $j = Get-Content "C:\at-measure\$f.json" -Raw | ConvertFrom-Json
  "== $f =="; $j.meta | Format-List; $j.summary | ConvertTo-Json -Depth 5
  "entries: " + $j.entries.Count
}
```
In `summary` look at: `fps`, `tickP95`, `ramMB`, `vramMB` (each with `min/mean/max`). Compare against the Windows budgets (tier 2x):

| Metric | Budget |
|---|---|
| FPS | a stable 60 (min must not drop noticeably below) |
| Simulation tick p95 | ≤ 4 ms |
| RAM of the whole app | ≤ 700 MB |
| VRAM (estimate) | ≤ 350 MB |

If the first seconds in `entries` are level loading, that is normal; do not silently discard them, but note exactly which ones.

## Step 6. Evidence on the "white screen" (read only, change nothing)

The owner has seen that during a long network game the window sometimes turns white and stops responding. Gather facts to help find the cause:
```powershell
# application crash events over the last 14 days (Application Error / .NET / WER)
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddDays(-14)} -ErrorAction SilentlyContinue |
  Where-Object { $_.Message -match 'Alien Transporter|electron' } |
  Select-Object TimeCreated,Id,ProviderName,@{n='Msg';e={$_.Message.Substring(0,[math]::Min(300,$_.Message.Length))}}
# what is in the game's data folder (names and dates only; do not read or send the file contents)
Get-ChildItem "$env:APPDATA\Alien Transporter Remaster" -Recurse -Depth 2 -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'log|crash|dmp|report' } | Select-Object FullName,Length,LastWriteTime
```
(Also `%LOCALAPPDATA%\CrashDumps`, if the folder exists.) Record what was found; **an empty result is also a result**. Ask the owner: did this happen in single-player or only over the network; on the host or on the client; after roughly how many minutes; what she was doing (minimized the window, the laptop was off the charger, the screen turned off). Record her answers verbatim.

## Step 7. Report

Create `C:\at-measure\REPORT.md` and show it to the owner. She will forward it together with `perf-l11.json` and `perf-l13.json`.

```markdown
# Windows measurement: Alien Transporter Remaster 0.1.0

Date: …
## Machine
(the output of step 1; what was open in the background)
## Installation
The installer ran: yes/no; SmartScreen: …; install path: …
## Level11 (tier 2x, 90 s, players: 1/2)
- tier per F3: …   FPS min/mean/max: …   tickP95: …   RAM max: … MB   VRAM max: … MB
- Did the menu screen get into the measurement: yes/no
- Noticeable jerks/lags by eye: …
## Level13 (the same)
…
## Budget
FPS 60: ok/no · tick p95 ≤ 4 ms: ok/no · RAM ≤ 700 MB: ok/no · VRAM ≤ 350 MB: ok/no
## White screen: evidence
- Windows log: …
- crash/dmp files: …
- The owner's answers: …
## Problems and observations
…
```
