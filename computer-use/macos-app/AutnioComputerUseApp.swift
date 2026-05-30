import SwiftUI

@main
struct AutnioComputerUseApp: App {
    @StateObject private var serviceController = ServiceController()
    @StateObject private var appConfig = AppConfig()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(serviceController)
                .environmentObject(appConfig)
                .frame(minWidth: 980, minHeight: 700)
        }
    }
}
