# Not a port (T3.7). Read-only diagnostics of a Windows 10 machine for the LAN game (docs/06-lan-testing.md).
# Changes nothing. Run in PowerShell:   powershell -ExecutionPolicy Bypass -File tools\net\windows-check.ps1
# Optional: -Peer 192.168.0.5   (the other machine; also tests its port 47020)
param([string]$Peer = "", [int]$Port = 47020)

Write-Host "== IPv4 addresses (the host shows the same on its Host screen) =="
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  ForEach-Object { Write-Host ("  {0}  ({1})" -f $_.IPAddress, $_.InterfaceAlias) }

Write-Host ""
Write-Host "== Network profile (Wi-Fi must be 'Private', otherwise the firewall blocks incoming connections) =="
Get-NetConnectionProfile | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Name, $_.NetworkCategory) }
Write-Host "  (Settings -> Network and Internet -> Wi-Fi -> the network -> Network profile: Private)"

Write-Host ""
Write-Host "== Firewall rules that mention the game or Electron =="
$rules = Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue |
  Where-Object { $_.Program -match "Alien|electron" } |
  ForEach-Object { Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $_ -ErrorAction SilentlyContinue }
if ($rules) {
  $rules | ForEach-Object { Write-Host ("  {0}  enabled={1}  action={2}  direction={3}  profile={4}" -f $_.DisplayName, $_.Enabled, $_.Action, $_.Direction, $_.Profile) }
} else {
  Write-Host "  none yet: Windows asks at the first 'Host game' (tick 'Private networks' and press Allow access)."
}

Write-Host ""
Write-Host "== Is something listening on the game port $Port (the game must be hosting)? =="
$l = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($l) { $l | ForEach-Object { Write-Host ("  listening on {0}:{1}" -f $_.LocalAddress, $_.LocalPort) } } else { Write-Host "  nothing (fine when this machine is the client)" }

if ($Peer -ne "") {
  Write-Host ""
  Write-Host "== Can this machine reach ${Peer}:${Port}? =="
  Test-NetConnection $Peer -Port $Port | Format-List ComputerName, RemotePort, TcpTestSucceeded, PingSucceeded
  Write-Host "  TcpTestSucceeded : True  -> the way is open. False -> firewall of the host, another network or Wi-Fi client isolation."
}
