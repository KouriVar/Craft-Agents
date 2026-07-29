import ApplicationServices
import Darwin
import Foundation

// A tiny, sandbox-free helper for the one shortcut Electron cannot express:
// the left and right Command keys pressed together. It emits one line per
// trigger and otherwise has no IPC, filesystem, or network access.
let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
guard AXIsProcessTrustedWithOptions([promptKey: true] as CFDictionary) else {
  print("STATUS accessibility-denied")
  fflush(stdout)
  exit(2)
}

var leftDown = false
var rightDown = false
var fired = false

let callback: CGEventTapCallBack = { _, type, event, _ in
  guard type == .flagsChanged else { return Unmanaged.passUnretained(event) }
  switch event.getIntegerValueField(.keyboardEventKeycode) {
  case 55: leftDown.toggle()   // kVK_Command
  case 54: rightDown.toggle()  // kVK_RightCommand
  default: return Unmanaged.passUnretained(event)
  }
  if leftDown && rightDown && !fired {
    fired = true
    print("TRIGGER")
    fflush(stdout)
  }
  if !leftDown || !rightDown { fired = false }
  return Unmanaged.passUnretained(event)
}

guard let tap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: CGEventMask(1 << CGEventType.flagsChanged.rawValue),
  callback: callback,
  userInfo: nil
) else {
  print("STATUS event-tap-unavailable")
  fflush(stdout)
  exit(3)
}

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
print("STATUS ready")
fflush(stdout)
CFRunLoopRun()
