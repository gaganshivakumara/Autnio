import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var service: ServiceController
    @EnvironmentObject private var config: AppConfig

    @State private var projectRoot: String = FileManager.default.currentDirectoryPath

    var body: some View {
        VStack(spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                configPanel
                statusPanel
            }
            Divider()
            RelayWebView(url: config.relayURLWithParams)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            logsPanel
        }
        .padding()
        .onAppear {
            service.refreshOIStatus()
        }
    }

    private var configPanel: some View {
        GroupBox("Config") {
            VStack(alignment: .leading, spacing: 8) {
                Text("Project root")
                TextField("/path/to/Autnio", text: $projectRoot)
                Text("WebSocket endpoint")
                TextField("wss://...", text: $config.wsEndpoint)
                Text("ID token")
                TextField("token", text: $config.idToken)
                Text("Relay URL")
                TextField("http://localhost:5174", text: $config.relayUrl)
            }
            .textFieldStyle(.roundedBorder)
        }
        .frame(maxWidth: 420)
    }

    private var statusPanel: some View {
        GroupBox("Local Service Control") {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("OI status:")
                    Text(service.oiRunning ? "Online" : "Offline")
                        .foregroundColor(service.oiRunning ? .green : .red)
                }
                Text(service.statusMessage)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                HStack {
                    Button("Start OI") {
                        service.startOI(projectRoot: projectRoot)
                    }
                    Button("Stop OI") {
                        service.stopOI()
                    }
                    Button("Refresh") {
                        service.refreshOIStatus()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var logsPanel: some View {
        GroupBox("Logs") {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(service.logs.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .frame(height: 180)
        }
    }
}
