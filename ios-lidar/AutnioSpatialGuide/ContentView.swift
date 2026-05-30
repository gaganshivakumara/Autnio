import ARKit
import SwiftUI

struct ContentView: View {
    @StateObject private var guidance = DepthGuidanceController()
    @StateObject private var voiceAgent = VoiceAgentController()

    var body: some View {
        ZStack(alignment: .bottom) {
            ARPreview(session: guidance.session)
                .ignoresSafeArea()
                .overlay {
                    if guidance.isRunning {
                        ObjectDetectionOverlay(detections: guidance.cameraDetections)
                    }
                }
                .overlay(alignment: .top) {
                    if guidance.isRunning {
                        DepthGridOverlay(regions: guidance.depthRegions)
                            .padding(.top, 56)
                            .padding(.horizontal, 14)
                    }
                }

            VStack(spacing: 18) {
                Spacer()

                cueCard

                Button(action: {
                    if guidance.isRunning {
                        guidance.stop()
                        if voiceAgent.isWalkingVoiceEnabled {
                            voiceAgent.stopWalkingVoice()
                        }
                    } else {
                        guidance.start()
                        voiceAgent.startWalkingVoice {
                            guidance.agentSceneContext
                        }
                    }
                }) {
                    Text(guidance.isRunning ? "Stop Obstacle Guidance" : "Start Obstacle Guidance")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(guidance.isRunning ? Color.red.opacity(0.9) : Color.green.opacity(0.9))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .disabled(!guidance.lidarAvailable)

                Button(action: {
                    voiceAgent.toggleListening(sceneContext: guidance.agentSceneContext)
                }) {
                    Text(askButtonText)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue.opacity(0.9))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .disabled(voiceAgent.isThinking || voiceAgent.isWalkingVoiceEnabled)

                Button(action: {
                    voiceAgent.toggleWalkingVoice {
                        guidance.agentSceneContext
                    }
                }) {
                    Text(voiceAgent.isWalkingVoiceEnabled ? "Walking Voice On" : "Start Walking Voice")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(voiceAgent.isWalkingVoiceEnabled ? Color.purple.opacity(0.9) : Color.indigo.opacity(0.9))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
            .padding()
        }
        .onDisappear {
            guidance.stop()
            if voiceAgent.isWalkingVoiceEnabled {
                voiceAgent.stopWalkingVoice()
            }
        }
    }

    private var cueCard: some View {
        VStack(spacing: 10) {
            Text("Autnio Spatial Guide")
                .font(.caption)
                .fontWeight(.semibold)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)

            Text(guidance.lidarAvailable ? guidance.latestCue.spokenText : "LiDAR depth is not available")
                .font(.title2)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)

            Text(statusText)
                .font(.subheadline.monospaced())
                .foregroundStyle(.secondary)

            Text("Camera: \(guidance.latestObjectLabel)")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)

            Text(guidance.detectorStatus)
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)

            Text("\(guidance.latestDepthResolution) · \(guidance.latestDepthFPS) FPS")
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)

            if !voiceAgent.transcript.isEmpty {
                Text("Heard: \(voiceAgent.transcript)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if !voiceAgent.lastResponse.isEmpty {
                Text(voiceAgent.lastResponse)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var statusText: String {
        let distance = String(format: "%.1f m", guidance.latestCue.distanceMeters)
        return "\(guidance.latestCue.zone.rawValue.uppercased()) · \(distance)"
    }

    private var askButtonText: String {
        if voiceAgent.isWalkingVoiceEnabled {
            return "Live AI Listening"
        }
        if voiceAgent.isThinking {
            return "Autnio Thinking..."
        }
        if voiceAgent.isListening {
            return "Stop & Ask Autnio"
        }
        return "Ask Autnio"
    }
}

struct ObjectDetectionOverlay: View {
    let detections: [CameraDetection]

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                ForEach(detections) { detection in
                    let rect = displayRect(for: detection.boundingBox, in: proxy.size)
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(.cyan, lineWidth: 2)
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.midX, y: rect.midY)

                    if rect.width > 12, rect.height > 12 {
                        Text("\(detection.label) \(Int(detection.confidence * 100))%")
                            .font(.caption2.monospacedDigit())
                            .fontWeight(.semibold)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.72))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                            .position(x: rect.minX + 42, y: max(14, rect.minY - 10))
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func displayRect(for normalizedBox: CGRect, in size: CGSize) -> CGRect {
        let width = normalizedBox.width * size.width
        let height = normalizedBox.height * size.height
        let x = normalizedBox.minX * size.width
        let y = (1 - normalizedBox.maxY) * size.height
        return CGRect(x: x, y: y, width: width, height: height)
    }
}

struct DepthGridOverlay: View {
    let regions: [DepthRegion]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 6) {
            ForEach(regions) { region in
                VStack(spacing: 4) {
                    Text(region.name)
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .textCase(.uppercase)
                    Text("\(String(format: "%.1f", region.roundedDistanceMeters)) m")
                        .font(.caption.monospacedDigit())
                }
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(.white)
                .background(color(for: region.zone).opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(8)
        .background(.black.opacity(0.22))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func color(for zone: GuidanceZone) -> Color {
        switch zone {
        case .clear:
            return .green
        case .caution:
            return .yellow
        case .warning:
            return .orange
        case .danger:
            return .red
        }
    }
}

struct ARPreview: UIViewRepresentable {
    let session: ARSession

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.session = session
        view.automaticallyUpdatesLighting = true
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {
        uiView.session = session
    }
}
