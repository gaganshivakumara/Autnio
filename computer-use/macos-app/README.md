# Autnio Computer Use macOS App (SwiftUI Wrapper)

This is a lightweight SwiftUI wrapper app for local computer-use operations on macOS.

## What it does

- Shows Open Interpreter and relay status
- Lets user start/stop local Open Interpreter
- Stores relay config (`wsEndpoint`, `idToken`, `relayUrl`)
- Embeds relay UI in a `WKWebView` (web dashboard mode)

The embedded web UI passes:

- `wsEndpoint`
- `idToken`
- `appMode=macos`

as query params to the relay dashboard URL.

## Project structure

- `AutnioComputerUseApp.swift` - app entrypoint
- `ContentView.swift` - main dashboard view
- `RelayWebView.swift` - WebKit wrapper
- `ServiceController.swift` - process/health helpers
- `AppConfig.swift` - config persistence model

## Build

1. Open Xcode
2. Create a new **macOS App** project named `AutnioComputerUseApp`
3. Replace generated files with the Swift files in this folder
4. Run on macOS 13+

## Notes

- This wrapper intentionally reuses relay logic in web code.
- For production distribution, add signing, entitlements, and notarization.
