import Foundation

final class ServiceController: ObservableObject {
    @Published var oiRunning = false
    @Published var statusMessage = "Idle"
    @Published var logs: [String] = []

    private var process: Process?

    func refreshOIStatus() {
        guard let url = URL(string: "http://localhost:8000/openai/chat/completions") else {
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "OPTIONS"
        URLSession.shared.dataTask(with: request) { [weak self] _, _, error in
            DispatchQueue.main.async {
                self?.oiRunning = (error == nil)
                self?.statusMessage = (error == nil) ? "Open Interpreter online" : "Open Interpreter offline"
            }
        }.resume()
    }

    func startOI(projectRoot: String) {
        stopOI()
        let scriptPath = "\(projectRoot)/computer-use/scripts/start-oi.sh"
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = ["-lc", scriptPath]

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                self?.appendLog(text.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }

        do {
            try proc.run()
            process = proc
            statusMessage = "Starting Open Interpreter..."
            appendLog("Started OI process")
        } catch {
            appendLog("Failed to start OI: \(error.localizedDescription)")
            statusMessage = "Failed to start Open Interpreter"
        }
    }

    func stopOI() {
        guard let proc = process else { return }
        if proc.isRunning {
            proc.terminate()
            appendLog("Stopped OI process")
        }
        process = nil
        refreshOIStatus()
    }

    private func appendLog(_ text: String) {
        logs.append("[\(Date())] \(text)")
        if logs.count > 300 {
            logs.removeFirst(logs.count - 300)
        }
    }
}
