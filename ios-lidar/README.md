# Autnio Spatial Guide

Native iPhone LiDAR companion for Autnio obstacle guidance.

The web camera can describe RGB frames, but mobile browsers do not expose iPhone Pro LiDAR depth maps. Real distance-aware navigation needs a native iOS ARKit path. This folder is the Autnio-owned scaffold for that companion app.

## Goal

- Use iPhone Pro LiDAR through ARKit `sceneDepth`.
- Use the iPhone RGB camera with Apple Vision classification, or a bundled CoreML/YOLO detector when available.
- Convert sparse depth into actionable navigation cues.
- Process LiDAR guidance at about `15 Hz` for real-time feedback.
- Run camera understanding asynchronously so it does not block LiDAR depth updates.
- Show a live DepthViz-style 3x3 LiDAR overlay on top of the iPhone camera preview.
- Show real-time object bounding boxes when a CoreML detector is bundled.
- Feed short cues into Autnio's obstacle guidance experience.
- Keep speech brief: distance, direction, hazard, and clear path.
- Detect people with Apple Vision and estimate their distance using LiDAR.
- Avoid constant speech. LiDAR pings for danger-distance hazards and speaks only for close people or close detected objects.
- Let the user ask Autnio by voice while walking and hear the AWS Bedrock-backed agent response.

## Reference Pattern

This follows the common open-source ARKit LiDAR accessibility pattern:

- ARKit streams RGB plus depth.
- Depth is sampled into a 3x3 navigation grid.
- The closest reliable region becomes the on-screen cue.
- Zones are classified as clear, caution, warning, and danger.
- Audio must be throttled so it never overlaps.

Autnio does not use the name or branding of any reference project. The implementation here is named `Autnio Spatial Guide`.

## Run On iPhone

You need full Xcode installed from the Mac App Store. Apple Command Line Tools alone are not enough to deploy ARKit apps to an iPhone.

Open this project in Xcode:

```bash
open ios-lidar/AutnioSpatialGuide.xcodeproj
```

Then:

1. Select an iPhone Pro / iPad Pro with LiDAR as the run target.
2. Unlock the iPhone and tap `Trust This Computer` if prompted.
3. On the iPhone, enable `Settings -> Privacy & Security -> Developer Mode` if Xcode asks.
4. In Xcode, select the `AutnioSpatialGuide` target.
5. Open `Signing & Capabilities`.
6. Check `Automatically manage signing`.
7. Select your Apple ID team.
8. If the bundle ID is already taken, change it from `com.autnio.spatialguide` to something unique, such as `com.<yourname>.autnio.spatialguide`.
9. Press the Xcode Run button.
10. Accept the camera permission on the phone.
11. Press `Start Obstacle Guidance`. This also starts walking voice listening.
12. Say `halo` to ask what the phone sees in front of you.

The app uses the iPhone LiDAR depth stream directly. This must run on device; the iOS simulator and mobile browsers cannot provide LiDAR scene depth.

## Object Detection Model

The iPhone app is real-time without a bundled model: LiDAR depth runs at about `15 Hz`, Apple Vision detects people, and camera classification runs in the background. For good everyday-object detection, add a CoreML detector named `AutnioObjectDetector.mlpackage`.

Preferred on-device setup:

```bash
ios-lidar/scripts/export-yolov12-coreml.sh n
```

Use `n` for fastest real-time iPhone performance, or `s` for better accuracy if your phone can handle it:

```bash
ios-lidar/scripts/export-yolov12-coreml.sh s
```

Backup prebuilt model setup:

```bash
ios-lidar/scripts/download-yolo-model.sh yolo26n
```

Then in Xcode:

1. Drag `ios-lidar/AutnioSpatialGuide/Models/AutnioObjectDetector.mlpackage` into the `AutnioSpatialGuide` app target.
2. Check `Copy items if needed`.
3. Make sure `AutnioSpatialGuide` is checked under `Add to targets`.
4. Run on the iPhone again.

When the model is bundled, `DepthGuidanceController` automatically loads `AutnioObjectDetector`, runs `VNCoreMLRequest` off the main thread, draws live boxes on the camera, and fuses the closest object box with LiDAR distance. If no model is bundled, the app falls back to Apple Vision classification so the build still works.

RF-DETR is a strong high-accuracy detector family, especially because the Apache 2.0 RF-DETR Nano/Small/Medium/Large models report better COCO AP than many YOLO baselines. The native iPhone app keeps RF-DETR as a model-selection target, but the current runtime slot expects a Vision/CoreML detector package. If you export RF-DETR to a CoreML detector package, name it `AutnioObjectDetector.mlpackage` and add it to the app target the same way. Otherwise, RF-DETR is better used from a nearby/server detector endpoint and its labels can be fed into the same Bedrock walking prompt.

License note: YOLOv12 and Ultralytics YOLO models are AGPL/commercial. RF-DETR Apache-designated models are Apache 2.0, while RF-DETR Plus components have separate terms. Autnio keeps detection as an optional model slot so you can choose the model/license that fits your use case.

### If Xcode Says "Untrusted Developer"

On the iPhone:

1. Open `Settings`.
2. Go to `General -> VPN & Device Management`.
3. Select your Apple ID developer profile.
4. Tap `Trust`.
5. Run the app again.

### If Xcode Cannot See The iPhone

- Use a USB cable first, not wireless.
- Keep the phone unlocked.
- Make sure Developer Mode is enabled.
- Update iOS and Xcode if the device support files are missing.

## iOS Implementation Pieces

- `AutnioSpatialGuide.xcodeproj`: runnable iOS app project.
- `AutnioSpatialGuide/AutnioSpatialGuideApp.swift`: SwiftUI app entry point.
- `AutnioSpatialGuide/ContentView.swift`: camera preview, real-time object boxes, DepthViz-style depth grid, Obstacle Guidance controls, and Ask Autnio voice controls.
- `AutnioSpatialGuide/DepthGuidance.swift`: ARKit session manager, RGB camera classification or optional CoreML/YOLO detection, confidence-aware 3x3 depth sampling, person distance cues, distance zones, and quiet speech.
- `AutnioSpatialGuide/VoiceAgentController.swift`: microphone speech recognition, chat Lambda call, and spoken agent response.
- `AutnioSpatialGuide/AppConfig.swift`: Autnio AWS endpoint configuration for the native app.
- `REFERENCES.md`: GitHub reference projects and how Autnio adapts the architecture under its own naming.
- `scripts/download-yolo-model.sh`: optional YOLO/CoreML model downloader for real-time object boxes.
- `scripts/export-yolov12-coreml.sh`: preferred YOLOv12 CoreML export path for stronger everyday-object detection.
- Future CoreML depth hook: replace or enrich raw ARKit depth with an RGB-guided depth upsampler.
- Future bridge: send `{direction, distanceMeters, zone, cue}` events to the web dashboard or Autnio backend over WebSocket.

## Device Requirements

- iPhone Pro / iPad Pro with LiDAR.
- iOS with ARKit scene depth support.
- Native app build from Xcode. Safari/Chrome cannot access LiDAR depth directly.

## Cue Examples

- `Person ahead, 1.0 meters`
- `Chair ahead, 0.8 meters`
- `Stop, obstacle ahead, 0.5 meters`
- Silent unless a hazard is close or the user asks `halo`.

## Voice Agent

Press `Ask Autnio`, speak your question, then press `Stop & Ask Autnio`.

Walking voice starts automatically when you press `Start Obstacle Guidance`. Say `halo`, `hey Autnio`, `what do you see`, `what am I looking at`, `what is happening around me`, or `what is in front of me`. The app keeps the ARKit camera/LiDAR session running while it listens. When a question is detected, it sends your transcript plus the current iPhone LiDAR/camera scene context to Autnio's AWS chat endpoint, which invokes the Bedrock agent. The response is spoken back on the iPhone at a slower speech rate without pausing the video/depth stream.

## Warning Policy

Obstacle Guidance is intentionally quiet:

- It smooths LiDAR distances to reduce meter jitter.
- It rounds spoken distances to half-meter steps.
- It does not speak every distance change.
- It plays a short audio ping when any hazard is in the danger zone.
- It speaks when Apple Vision detects a person within about `1.25 m`.
- It speaks when a detected object is within about `0.9 m`.
- It shows nearby obstacle and danger zones on screen without vibration.
- It pairs the camera's best object/scene label with the nearest LiDAR distance for the on-screen cue.
- It can pair YOLO/CoreML object boxes with LiDAR distance when a detector model is bundled.
- It shows live depth resolution and estimated processing FPS in the iPhone UI.
- It renders live depth zones directly over the camera preview: green clear, yellow caution, orange warning, red danger.

These cues should run alongside the existing web vision description: LiDAR handles distance and immediate safety, while the vision model handles object identity and scene context.

## How This Pairs With Web Obstacle Guidance

The web app's `Obstacle Guidance` panel still uses camera frames and Nemotron Nano 2 VL for scene context. The iPhone app supplies the missing metric depth layer:

- iPhone camera + LiDAR: object/scene label, distance, direction, immediate collision risk.
- Nemotron stream: object/scene language and blind-user context.
- Autnio speech rule: never overlap audio; speak short actionable cues only.
