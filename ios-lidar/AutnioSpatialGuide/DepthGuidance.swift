import ARKit
import AudioToolbox
import AVFoundation
import CoreML
import Foundation
import SwiftUI
import UIKit
import Vision

enum GuidanceZone: String {
    case clear
    case caution
    case warning
    case danger
}

struct DepthCue: Equatable {
    let direction: String
    let distanceMeters: Float
    let zone: GuidanceZone
    let label: String

    var roundedDistanceMeters: Float {
        (distanceMeters * 2).rounded() / 2
    }

    var spokenText: String {
        if label == "person" {
            return "Person \(direction), \(String(format: "%.1f", roundedDistanceMeters)) meters"
        }
        if !["path", "obstacle", "sensor"].contains(label) {
            return "\(label.capitalized) \(direction), \(String(format: "%.1f", roundedDistanceMeters)) meters"
        }

        switch zone {
        case .clear:
            return "Clear path ahead"
        case .caution:
            return "Obstacle \(direction), \(String(format: "%.1f", roundedDistanceMeters)) meters"
        case .warning:
            return "Careful, obstacle \(direction), \(String(format: "%.1f", roundedDistanceMeters)) meters"
        case .danger:
            return "Stop, obstacle \(direction), \(String(format: "%.1f", roundedDistanceMeters)) meters"
        }
    }
}

struct DepthRegion: Identifiable, Equatable {
    let name: String
    let distanceMeters: Float
    let zone: GuidanceZone

    var id: String { name }

    var roundedDistanceMeters: Float {
        (distanceMeters * 2).rounded() / 2
    }
}

struct CameraDetection: Identifiable, Equatable {
    let id = UUID()
    let label: String
    let confidence: Float
    let boundingBox: CGRect
    let distanceMeters: Float?
}

final class DepthGuidanceController: NSObject, ObservableObject, ARSessionDelegate {
    @Published private(set) var latestCue = DepthCue(direction: "ahead", distanceMeters: 3, zone: .clear, label: "path")
    @Published private(set) var isRunning = false
    @Published private(set) var lidarAvailable = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    @Published private(set) var latestObjectLabel = "Scanning"
    @Published private(set) var latestDepthFPS = 0
    @Published private(set) var latestDepthResolution = "Depth: --"
    @Published private(set) var depthRegions: [DepthRegion] = []
    @Published private(set) var cameraDetections: [CameraDetection] = []
    @Published private(set) var detectorStatus = "Apple Vision fallback"

    let session = ARSession()
    private let speaker = AVSpeechSynthesizer()
    private var lastSpokenCue: DepthCue?
    private var lastSpeechTime = Date.distantPast
    private var lastPingTime = Date.distantPast
    private var lastPersonObservation: VNHumanObservation?
    private var latestObjectObservations: [VNRecognizedObjectObservation] = []
    private var latestVisionLabel: String?
    private let objectDetectionModel: VNCoreMLModel? = DepthGuidanceController.loadBundledObjectDetector()
    private let understandingLock = NSLock()
    private let visionQueue = DispatchQueue(label: "com.autnio.spatialguide.vision", qos: .userInitiated)
    private var isCameraUnderstandingRunning = false
    private var lastCameraUnderstandingTime: TimeInterval = 0
    private var lastDepthProcessingTime: TimeInterval = 0
    private var fpsWindowStart: TimeInterval = 0
    private var fpsFrameCount = 0
    private var smoothedDistances: [String: Float] = [:]
    private let minimumSpeechGap: TimeInterval = 5.0
    private let personSpeechDistance: Float = 1.25
    private let objectSpeechDistance: Float = 0.9
    private let pingDistance: Float = 0.75
    private let minimumPingGap: TimeInterval = 1.35
    private let targetDepthInterval: TimeInterval = 1.0 / 15.0
    private let cameraUnderstandingInterval: TimeInterval = 0.45

    override init() {
        super.init()
        session.delegate = self
        detectorStatus = objectDetectionModel == nil ? "Apple Vision fallback" : "CoreML object detector active"
    }

    func start() {
        guard ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) else {
            latestCue = DepthCue(direction: "ahead", distanceMeters: 0, zone: .danger, label: "sensor")
            speak("LiDAR depth is not available on this device")
            return
        }

        let config = ARWorldTrackingConfiguration()
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            config.frameSemantics.insert(.smoothedSceneDepth)
        } else {
            config.frameSemantics.insert(.sceneDepth)
        }
        config.planeDetection = [.horizontal, .vertical]
        session.run(config)
        isRunning = true
    }

    func stop() {
        session.pause()
        speaker.stopSpeaking(at: .immediate)
        isRunning = false
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let depthData = frame.smoothedSceneDepth ?? frame.sceneDepth else { return }
        let now = frame.timestamp

        if now - lastDepthProcessingTime < targetDepthInterval {
            return
        }
        lastDepthProcessingTime = now

        if now - lastCameraUnderstandingTime >= cameraUnderstandingInterval, !isCameraUnderstandingRunning {
            lastCameraUnderstandingTime = now
            updateCameraUnderstandingAsync(from: frame)
        }

        understandingLock.lock()
        let personObservation = lastPersonObservation
        let objectObservations = latestObjectObservations
        let visionLabel = latestVisionLabel
        understandingLock.unlock()

        let cue = makeCue(
            from: depthData.depthMap,
            confidenceMap: depthData.confidenceMap,
            personObservation: personObservation,
            objectObservations: objectObservations,
            visionLabel: visionLabel
        )

        updateRealtimeTelemetry(depthMap: depthData.depthMap, timestamp: now)

        DispatchQueue.main.async {
            self.latestCue = cue
        }

        if shouldPing(cue) {
            playPing()
            lastPingTime = Date()
        }

        if shouldSpeak(cue) {
            speak(cue.spokenText)
            lastSpokenCue = cue
            lastSpeechTime = Date()
        }
    }

    var agentSceneContext: String {
        let regions = depthRegions
            .sorted { $0.distanceMeters < $1.distanceMeters }
            .prefix(3)
            .map { "\($0.name): \(String(format: "%.1f", $0.roundedDistanceMeters)) meters, \($0.zone.rawValue)" }
            .joined(separator: "; ")
        let detections = cameraDetections
            .prefix(5)
            .map { "\($0.label) \(Int($0.confidence * 100))%" }
            .joined(separator: ", ")
        return """
        Current iPhone LiDAR scene:
        Closest cue: \(latestCue.spokenText).
        Depth grid: \(regions.isEmpty ? "still scanning" : regions).
        Camera detections: \(detections.isEmpty ? latestObjectLabel : detections).
        Detector: \(detectorStatus).
        Answer like a walking assistant for a blind user. Use plain speech only. No markdown, emoji, bullets, or symbols. Be brief, mention close hazards first, and include direction and distance when known.
        """
    }

    private func makeCue(
        from depthMap: CVPixelBuffer,
        confidenceMap: CVPixelBuffer?,
        personObservation: VNHumanObservation?,
        objectObservations: [VNRecognizedObjectObservation],
        visionLabel: String?
    ) -> DepthCue {
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        if let confidenceMap {
            CVPixelBufferLockBaseAddress(confidenceMap, .readOnly)
        }
        defer {
            CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
            if let confidenceMap {
                CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly)
            }
        }

        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        let rowBytes = CVPixelBufferGetBytesPerRow(depthMap)
        let base = CVPixelBufferGetBaseAddress(depthMap)!.assumingMemoryBound(to: UInt8.self)
        let confidenceBase = confidenceMap.flatMap { CVPixelBufferGetBaseAddress($0)?.assumingMemoryBound(to: UInt8.self) }
        let confidenceRowBytes = confidenceMap.map { CVPixelBufferGetBytesPerRow($0) } ?? 0

        let regions: [(name: String, x0: Int, x1: Int, y0: Int, y1: Int)] = [
            ("upper left", 0, width / 3, 0, height / 3),
            ("ahead high", width / 3, 2 * width / 3, 0, height / 3),
            ("upper right", 2 * width / 3, width, 0, height / 3),
            ("left", 0, width / 3, height / 3, 2 * height / 3),
            ("ahead", width / 3, 2 * width / 3, height / 3, 2 * height / 3),
            ("right", 2 * width / 3, width, height / 3, 2 * height / 3),
            ("lower left", 0, width / 3, 2 * height / 3, height),
            ("low ahead", width / 3, 2 * width / 3, 2 * height / 3, height),
            ("lower right", 2 * width / 3, width, 2 * height / 3, height)
        ]

        var bestDirection = "ahead"
        var nearest: Float = 10
        var depthRegions: [DepthRegion] = []

        for region in regions {
            let distance = medianDepth(
                base: base,
                rowBytes: rowBytes,
                confidenceBase: confidenceBase,
                confidenceRowBytes: confidenceRowBytes,
                x0: region.x0,
                x1: region.x1,
                y0: region.y0,
                y1: region.y1
            )
            let displayDistance = smoothDistance(distance, key: "grid-\(region.name)")
            depthRegions.append(
                DepthRegion(name: region.name, distanceMeters: displayDistance, zone: zone(for: displayDistance))
            )

            if displayDistance > 0, displayDistance < nearest {
                nearest = displayDistance
                bestDirection = region.name
            }
        }

        DispatchQueue.main.async {
            self.depthRegions = depthRegions
        }

        if let personCue = personCue(
            observation: personObservation,
            depthBase: base,
            rowBytes: rowBytes,
            width: width,
            height: height,
            confidenceBase: confidenceBase,
            confidenceRowBytes: confidenceRowBytes
        ) {
            return stabilize(personCue)
        }

        if let objectCue = objectCue(
            observations: objectObservations,
            depthBase: base,
            rowBytes: rowBytes,
            width: width,
            height: height,
            confidenceBase: confidenceBase,
            confidenceRowBytes: confidenceRowBytes
        ) {
            return stabilize(objectCue)
        }

        let objectLabel = visionLabel ?? "obstacle"
        return stabilize(DepthCue(direction: bestDirection, distanceMeters: nearest, zone: zone(for: nearest), label: objectLabel))
    }

    private func medianDepth(
        base: UnsafePointer<UInt8>,
        rowBytes: Int,
        confidenceBase: UnsafePointer<UInt8>?,
        confidenceRowBytes: Int,
        x0: Int,
        x1: Int,
        y0: Int,
        y1: Int
    ) -> Float {
        var samples: [Float] = []
        let step = 6

        for y in stride(from: y0, to: y1, by: step) {
            for x in stride(from: x0, to: x1, by: step) {
                if let confidenceBase {
                    let confidence = confidenceBase.advanced(by: y * confidenceRowBytes)[x]
                    if confidence == 0 { continue }
                }

                let row = base.advanced(by: y * rowBytes)
                let value = row.withMemoryRebound(to: Float32.self, capacity: x + 1) { $0[x] }
                if value.isFinite, value > 0.15, value < 6 {
                    samples.append(value)
                }
            }
        }

        guard !samples.isEmpty else { return 10 }
        samples.sort()
        return samples[samples.count / 2]
    }

    private func updateRealtimeTelemetry(depthMap: CVPixelBuffer, timestamp: TimeInterval) {
        fpsFrameCount += 1
        if fpsWindowStart == 0 {
            fpsWindowStart = timestamp
        }

        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        let elapsed = timestamp - fpsWindowStart
        guard elapsed >= 1 else { return }

        let fps = Int((Double(fpsFrameCount) / elapsed).rounded())
        fpsFrameCount = 0
        fpsWindowStart = timestamp

        DispatchQueue.main.async {
            self.latestDepthFPS = fps
            self.latestDepthResolution = "Depth: \(width)x\(height)"
        }
    }

    private func updateCameraUnderstandingAsync(from frame: ARFrame) {
        isCameraUnderstandingRunning = true
        let pixelBuffer = frame.capturedImage

        visionQueue.async { [weak self] in
            defer {
                DispatchQueue.main.async {
                    self?.isCameraUnderstandingRunning = false
                }
            }

            self?.updateCameraUnderstanding(from: pixelBuffer)
        }
    }

    private func updateCameraUnderstanding(from pixelBuffer: CVPixelBuffer) {
        var requests: [VNRequest] = []

        let personRequest = VNDetectHumanRectanglesRequest { [weak self] request, _ in
            let observations = (request.results as? [VNHumanObservation]) ?? []
            let best = observations.max(by: { $0.confidence < $1.confidence })
            self?.understandingLock.lock()
            self?.lastPersonObservation = best
            self?.understandingLock.unlock()
        }
        personRequest.upperBodyOnly = false
        requests.append(personRequest)

        if let objectDetectionModel {
            let objectRequest = VNCoreMLRequest(model: objectDetectionModel) { [weak self] request, _ in
                let observations = ((request.results as? [VNRecognizedObjectObservation]) ?? [])
                    .filter { $0.confidence > 0.25 && !$0.labels.isEmpty }
                    .prefix(8)
                let detections = observations.map { observation in
                    CameraDetection(
                        label: Self.shortLabel(from: observation.labels[0].identifier),
                        confidence: observation.confidence,
                        boundingBox: observation.boundingBox,
                        distanceMeters: nil
                    )
                }

                self?.understandingLock.lock()
                self?.latestObjectObservations = Array(observations)
                self?.latestVisionLabel = detections.first?.label
                self?.understandingLock.unlock()

                DispatchQueue.main.async {
                    self?.cameraDetections = detections
                    self?.latestObjectLabel = detections.first?.label.capitalized ?? "Scanning"
                }
            }
            objectRequest.imageCropAndScaleOption = .scaleFill
            requests.append(objectRequest)
        } else {
            let classificationRequest = VNClassifyImageRequest { [weak self] request, _ in
                let observations = (request.results as? [VNClassificationObservation]) ?? []
                guard let best = observations.first(where: { $0.confidence > 0.28 }) else { return }
                let label = Self.shortLabel(from: best.identifier)
                self?.understandingLock.lock()
                self?.latestVisionLabel = label
                self?.latestObjectObservations = []
                self?.understandingLock.unlock()

                DispatchQueue.main.async {
                    self?.cameraDetections = []
                    self?.latestObjectLabel = label.capitalized
                }
            }
            requests.append(classificationRequest)
        }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
        try? handler.perform(requests)
    }

    private static func shortLabel(from identifier: String) -> String {
        let first = identifier
            .split(separator: ",")
            .first
            .map(String.init) ?? identifier
        return first
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private func personCue(
        observation: VNHumanObservation?,
        depthBase: UnsafePointer<UInt8>,
        rowBytes: Int,
        width: Int,
        height: Int,
        confidenceBase: UnsafePointer<UInt8>?,
        confidenceRowBytes: Int
    ) -> DepthCue? {
        guard let observation, observation.confidence > 0.45 else { return nil }

        let box = observation.boundingBox
        let centerX = Int((box.midX * CGFloat(width)).rounded()).clamped(to: 0...(width - 1))
        let centerY = Int(((1 - box.midY) * CGFloat(height)).rounded()).clamped(to: 0...(height - 1))
        let halfWidth = max(4, width / 18)
        let halfHeight = max(4, height / 18)
        let distance = medianDepth(
            base: depthBase,
            rowBytes: rowBytes,
            confidenceBase: confidenceBase,
            confidenceRowBytes: confidenceRowBytes,
            x0: max(0, centerX - halfWidth),
            x1: min(width, centerX + halfWidth),
            y0: max(0, centerY - halfHeight),
            y1: min(height, centerY + halfHeight)
        )

        guard distance < 3.5 else { return nil }

        let direction: String
        if centerX < width / 3 {
            direction = "left"
        } else if centerX > 2 * width / 3 {
            direction = "right"
        } else {
            direction = "ahead"
        }

        return DepthCue(direction: direction, distanceMeters: distance, zone: zone(for: distance), label: "person")
    }

    private func objectCue(
        observations: [VNRecognizedObjectObservation],
        depthBase: UnsafePointer<UInt8>,
        rowBytes: Int,
        width: Int,
        height: Int,
        confidenceBase: UnsafePointer<UInt8>?,
        confidenceRowBytes: Int
    ) -> DepthCue? {
        let candidates = observations.compactMap { observation -> DepthCue? in
            guard let label = observation.labels.first, observation.confidence > 0.25 else { return nil }
            let box = observation.boundingBox
            let centerX = Int((box.midX * CGFloat(width)).rounded()).clamped(to: 0...(width - 1))
            let centerY = Int(((1 - box.midY) * CGFloat(height)).rounded()).clamped(to: 0...(height - 1))
            let halfWidth = max(4, width / 20)
            let halfHeight = max(4, height / 20)
            let distance = medianDepth(
                base: depthBase,
                rowBytes: rowBytes,
                confidenceBase: confidenceBase,
                confidenceRowBytes: confidenceRowBytes,
                x0: max(0, centerX - halfWidth),
                x1: min(width, centerX + halfWidth),
                y0: max(0, centerY - halfHeight),
                y1: min(height, centerY + halfHeight)
            )
            guard distance < 5.0 else { return nil }

            let direction: String
            if centerX < width / 3 {
                direction = "left"
            } else if centerX > 2 * width / 3 {
                direction = "right"
            } else {
                direction = "ahead"
            }

            return DepthCue(
                direction: direction,
                distanceMeters: distance,
                zone: zone(for: distance),
                label: Self.shortLabel(from: label.identifier)
            )
        }

        return candidates.min(by: { $0.distanceMeters < $1.distanceMeters })
    }

    private func stabilize(_ cue: DepthCue) -> DepthCue {
        let key = "\(cue.label)-\(cue.direction)"
        let smoothed = smoothDistance(cue.distanceMeters, key: key)
        return DepthCue(direction: cue.direction, distanceMeters: smoothed, zone: zone(for: smoothed), label: cue.label)
    }

    private func smoothDistance(_ distance: Float, key: String) -> Float {
        let prior = smoothedDistances[key] ?? distance
        let smoothed = prior * 0.78 + distance * 0.22
        smoothedDistances[key] = smoothed
        return smoothed
    }

    private func zone(for distance: Float) -> GuidanceZone {
        if distance < 0.55 { return .danger }
        if distance < 1.05 { return .warning }
        if distance < 2.0 { return .caution }
        return .clear
    }

    private func shouldSpeak(_ cue: DepthCue) -> Bool {
        if Date().timeIntervalSince(lastSpeechTime) < minimumSpeechGap { return false }
        let isClosePerson = cue.label == "person" && cue.distanceMeters <= personSpeechDistance
        let isCloseObject = cue.label != "person" && cue.label != "path" && cue.distanceMeters <= objectSpeechDistance
        let isUnknownDanger = cue.label == "obstacle" && cue.zone == .danger
        guard isClosePerson || isCloseObject || isUnknownDanger else { return false }
        if let lastSpokenCue,
           lastSpokenCue.label == cue.label,
           lastSpokenCue.direction == cue.direction,
           abs(lastSpokenCue.roundedDistanceMeters - cue.roundedDistanceMeters) < 0.5 {
            return false
        }
        return true
    }

    private func shouldPing(_ cue: DepthCue) -> Bool {
        guard cue.distanceMeters <= pingDistance, cue.zone == .danger else { return false }
        return Date().timeIntervalSince(lastPingTime) >= minimumPingGap
    }

    private func playPing() {
        AudioServicesPlaySystemSound(1103)
    }

    private func speak(_ text: String) {
        speaker.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = 0.48
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        speaker.speak(utterance)
    }

    private static func loadBundledObjectDetector() -> VNCoreMLModel? {
        guard let url = Bundle.main.url(forResource: "AutnioObjectDetector", withExtension: "mlmodelc") else {
            return nil
        }

        guard let model = try? MLModel(contentsOf: url) else { return nil }
        return try? VNCoreMLModel(for: model)
    }

}

private extension Comparable {
    func clamped(to limits: ClosedRange<Self>) -> Self {
        min(max(self, limits.lowerBound), limits.upperBound)
    }
}
