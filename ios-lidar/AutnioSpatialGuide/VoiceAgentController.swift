import AVFoundation
import Foundation
import Speech

struct AgentResponse: Decodable {
    let response: String?
    let result: String?
    let message: String?

    var text: String {
        response ?? result ?? message ?? "I did not get a response."
    }
}

@MainActor
final class VoiceAgentController: NSObject, ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var isWalkingVoiceEnabled = false
    @Published private(set) var isThinking = false
    @Published private(set) var transcript = ""
    @Published private(set) var lastResponse = ""

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private let speaker = AVSpeechSynthesizer()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var sceneContextProvider: (() -> String)?
    private var pendingPromptTask: Task<Void, Never>?
    private var lastSubmittedPrompt = ""
    private var lastSubmissionTime = Date.distantPast
    private var ignoreTranscriptUntil = Date.distantPast

    func toggleListening(sceneContext: String? = nil) {
        if isListening {
            stopListeningAndAsk(sceneContext: sceneContext)
        } else {
            startListening(sceneContext: sceneContext)
        }
    }

    func toggleWalkingVoice(sceneContextProvider: @escaping () -> String) {
        if isWalkingVoiceEnabled {
            stopWalkingVoice()
            return
        }

        startWalkingVoice(sceneContextProvider: sceneContextProvider)
    }

    func startWalkingVoice(sceneContextProvider: @escaping () -> String) {
        guard !isWalkingVoiceEnabled else { return }

        self.sceneContextProvider = sceneContextProvider
        isWalkingVoiceEnabled = true
        startListening(sceneContext: sceneContextProvider(), continuous: true)
    }

    func stopWalkingVoice() {
        isWalkingVoiceEnabled = false
        stopAudioOnly()
    }

    func startListening(sceneContext: String? = nil, continuous: Bool = false) {
        Task {
            guard await requestPermissions() else {
                speak("Microphone or speech recognition permission is missing.")
                return
            }

            transcript = ""
            lastResponse = ""
            recognitionTask?.cancel()
            recognitionTask = nil

            let audioSession = AVAudioSession.sharedInstance()
            try? audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.duckOthers, .defaultToSpeaker])
            try? audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            recognitionRequest = request

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in
                request?.append(buffer)
            }

            audioEngine.prepare()
            do {
                try audioEngine.start()
                isListening = true
            } catch {
                speak("Could not start listening.")
                return
            }

            recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                Task { @MainActor in
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                        if continuous {
                            self.scheduleWalkingPromptIfNeeded(self.transcript)
                        }
                    }
                    if error != nil {
                        self.stopAudioOnly(keepWalkingVoice: continuous)
                    }
                }
            }
        }
    }

    func stopListeningAndAsk(sceneContext: String? = nil) {
        stopAudioOnly()
        let prompt = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else {
            speak("I did not hear a question.")
            return
        }

        Task {
            await askAgent(prompt, sceneContext: sceneContext)
        }
    }

    private func stopAudioOnly(keepWalkingVoice: Bool = false) {
        pendingPromptTask?.cancel()
        pendingPromptTask = nil
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        isListening = false
        if !keepWalkingVoice {
            isWalkingVoiceEnabled = false
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func scheduleWalkingPromptIfNeeded(_ rawTranscript: String) {
        let normalized = rawTranscript.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.count >= 4 else { return }
        guard Date() >= ignoreTranscriptUntil else { return }
        guard !isThinking, !speaker.isSpeaking else { return }

        let isWakeOrQuestion =
            normalized.contains("halo") ||
            normalized.contains("halos") ||
            normalized.contains("hello") ||
            normalized.contains("hey autnio") ||
            normalized.contains("autnio") ||
            normalized.contains("what do you see") ||
            normalized.contains("what is in front") ||
            normalized.contains("what's in front") ||
            normalized.contains("what am i looking at") ||
            normalized.contains("what is my camera looking at") ||
            normalized.contains("camera looking at") ||
            normalized.contains("what is happening around me") ||
            normalized.contains("what's happening around me") ||
            normalized.contains("what is around me") ||
            normalized.contains("where should i go") ||
            normalized.contains("?")

        guard isWakeOrQuestion else { return }
        guard normalized != lastSubmittedPrompt else { return }
        guard Date().timeIntervalSince(lastSubmissionTime) > 4 else { return }

        pendingPromptTask?.cancel()
        pendingPromptTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 900_000_000)
            await self?.submitWalkingPrompt()
        }
    }

    private func submitWalkingPrompt() async {
        let prompt = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else { return }

        lastSubmittedPrompt = prompt.lowercased()
        lastSubmissionTime = Date()
        transcript = ""
        await askAgent(prompt, sceneContext: sceneContextProvider?())
    }

    private func askAgent(_ prompt: String, sceneContext: String? = nil) async {
        isThinking = true
        defer { isThinking = false }

        do {
            let normalizedPrompt = prompt.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            let wakeWords = ["halo", "halos", "hello", "hey autnio", "autnio"]
            let userPrompt = wakeWords.contains(normalizedPrompt)
                ? "What do you see in front of me?"
                : prompt
            let fullPrompt = [sceneContext, userPrompt]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: "\n\nUser question: ")

            var request = URLRequest(url: AppConfig.chatEndpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "prompt": fullPrompt,
                "userId": AppConfig.userId,
                "sessionId": AppConfig.walkingVoiceSessionId
            ])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
                speak("The agent request failed.")
                return
            }

            let decoded = try JSONDecoder().decode(AgentResponse.self, from: data)
            lastResponse = decoded.text
            speak(decoded.text)
        } catch {
            speak("I could not reach Autnio right now.")
        }
    }

    private func requestPermissions() async -> Bool {
        let speechAllowed = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }

        let micAllowed = await AVAudioApplication.requestRecordPermission()
        return speechAllowed && micAllowed
    }

    private func speak(_ text: String) {
        ignoreTranscriptUntil = Date().addingTimeInterval(max(2.5, Double(text.count) / 15.0))
        speaker.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = 0.48
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        speaker.speak(utterance)
    }
}
