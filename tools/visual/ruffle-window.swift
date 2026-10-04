// Prints the window number (CGWindowID) of the first on-screen Ruffle window; exit code 1 when there is none.
// Used by tools/visual/ruffle-reference.ts: `swift tools/visual/ruffle-window.swift`.
import CoreGraphics
import Foundation

let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in list {
  let owner = (w[kCGWindowOwnerName as String] as? String ?? "").lowercased()
  let layer = w[kCGWindowLayer as String] as? Int ?? 0
  if owner.contains("ruffle") && layer == 0 {
    print(w[kCGWindowNumber as String]!)
    exit(0)
  }
}
exit(1)
