# LiDAR Reference Setup

Autnio Spatial Guide is an original implementation. It uses public project patterns as references, not their names or copied source.

## Reference Repositories

- `WillyShaoZ/Guider`: ARKit LiDAR accessibility app pattern with real-time obstacle detection, 3x3 depth zones, and voice cues.
- `atirupati7/pathfindr`: ARKit/LiDAR navigation pattern with depth sensing, spatial guidance, and multimodal assistance.
- `hefestru/eyes-ios`: LiDAR obstacle distance announcements for blind and visually impaired users.
- `xiongyiheng/ARKit-Scanner`: RGB-D acquisition pattern using iPhone LiDAR and ARKit.
- `tersite1/DepthViz`: iPhone LiDAR point-cloud scanner reference for combining LiDAR, RGB camera, and device motion. Its listed license is noncommercial/no-derivatives, so Autnio uses it only as an architecture reference and does not copy or derive from its source.
- `nicedreamzapp/RealTimeAICam`: real-time iPhone camera pattern with YOLO/CoreML, OCR, and LiDAR distance. Its GPL/commercial licensing means Autnio references the architecture but does not copy source.
- `celiobjunior/object-detection`: simple SwiftUI/Vision/CoreML real-time camera pipeline reference.
- `cedanmisquith/SwiftUI-LiDAR`: MIT-licensed SwiftUI + ARKit LiDAR scanning pattern for native iPhone depth capture.
- `ultralytics/yolo-ios-app`: YOLO/CoreML iOS reference for high-FPS on-device object detection. Its AGPL/commercial licensing means Autnio uses an optional model slot instead of vendoring its package by default.
- `S2dentik/yolo-world-ios`: open-vocabulary CoreML + LiDAR pattern for asking about arbitrary objects in real time.
- `Barath19/Boxer3D`: YOLO + LiDAR pattern for lifting 2D detections into 3D-aware object context.
- `sunsmarterjie/yolov12`: attention-centric real-time detector family. Autnio uses this as the preferred export path for an on-device `AutnioObjectDetector.mlpackage`; YOLOv12 is AGPL-3.0, so keep licensing in mind.
- `roboflow/rf-detr`: high-accuracy real-time DETR detector family with Apache-designated Nano/Small/Medium/Large models. Autnio documents it as the preferred high-accuracy model target when exported to CoreML or run from an external detector service.

## Autnio Implementation

Autnio keeps its own product/app naming:

- App name: `Autnio Spatial Guide`
- Core controller: `DepthGuidanceController`
- User-facing feature: `Obstacle Guidance`

The iPhone app currently implements:

- ARKit `sceneDepth` / `smoothedSceneDepth`.
- Apple Vision RGB camera classification.
- Optional CoreML/YOLO object detection through a bundled `AutnioObjectDetector.mlpackage`.
- Preferred YOLOv12 CoreML export script for everyday-object detection.
- Real-time LiDAR loop at about 15 Hz.
- Background camera understanding so object detection does not block depth guidance.
- Live object boxes over the camera preview when a detector model is bundled.
- Live depth-zone overlay on the camera preview, inspired by point-cloud/depth scanner UX patterns.
- Confidence-aware LiDAR sampling.
- 3x3 spatial grid: high/mid/low and left/ahead/right.
- Nearest-obstacle distance in meters.
- Apple Vision human rectangle detection.
- Person distance cues from the LiDAR depth at the detected person location.
- Close-object audio pings without haptics/vibration.
- Close object speech when an object is detected inside the walking safety radius.
- Walking voice mode that sends the current LiDAR/camera context to the AWS Bedrock-backed chat endpoint.
- Four zones: clear, caution, warning, danger.
- Audio throttling and immediate speech cancellation to prevent overlapping voices.
- No vibration/haptics in the current Autnio app by request.

## Relationship To Web Obstacle Guidance

The web `Obstacle Guidance` panel is still useful for RGB model description:

- Web + Nemotron: object and scene language.
- iPhone LiDAR: metric distance, people distance, immediate collision risk.

For blind navigation, the iPhone app should be the primary real-time safety layer because it can access LiDAR. The web app cannot access iPhone LiDAR from Safari/Chrome.
