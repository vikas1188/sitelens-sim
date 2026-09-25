# Liquid AI detection runtime

The working demo uses Liquid's **LFM2.5-VL-450M**, locally and keylessly. No cloud model provider or model API credential is involved. Downloaded weights and projector are cached under `.runtime/models/` (about 317 MB combined) and must remain git-ignored. The first download needs internet; inference thereafter does not.

## Run on the Mac

```sh
./scripts/liquid-start.sh
```

This installs `llama.cpp` with Homebrew if absent, downloads the official Q4_K_M model and Q8_0 vision projector, and starts an OpenAI-compatible HTTP service on loopback port 8089. If the selected port already serves a healthy runtime with the exact Liquid model alias, it reuses that process. If occupied by another service, it chooses the next available port and writes `LIQUID_BASE_URL` and `LIQUID_PORT` to `.runtime/liquid.env`. Start the application after this file exists, or export its contents into the backend's environment. No raw images are persisted by the launcher. The application sends a fresh image request for each inspection.

```sh
python3 scripts/liquid-smoke.py
python3 scripts/liquid-smoke.py /absolute/path/to/photo.jpg
```

The smoke test performs real inference, parses JSON, and verifies required types. It does not establish detector accuracy or suitability for unsupervised safety decisions. Human review remains necessary, especially for occluded PPE, small workers, glare, and non-construction images.

## iPhone source (requires Xcode and a physical device)

`ios/SiteLens/SiteLensApp.swift` contains camera preview, approximately two-second sequential inspection, immediate red violation banner, and event upload. Every on-device inference creates a fresh conversation so camera history never accumulates. Server fallback sends a JPEG to `POST /api/detect`; on-device inference sends only detection JSON to `POST /events`.

1. Install Xcode 16+ and select its developer directory. Install XcodeGen (`brew install xcodegen`).
2. Open the included `ios/SiteLens.xcodeproj`. To regenerate it after editing `project.yml`, run `cd ios && xcodegen generate`.
3. Select your signing team and connected physical iPhone, enable Developer Mode on the phone, and build/run.
4. Put phone and Mac on the same local network. Set the backend URL to the Mac's LAN address and actual application port. The backend must listen on the LAN interface.
5. Start inspection. The first on-device launch downloads the model; subsequent runs use its cache. The UI exposes a clearly labelled Mac fallback toggle.

This environment has Command Line Tools but **no Xcode installation**, so the Swift source can be syntax-parsed but cannot be linked, signed, installed, or physically tested here. Do not present the iPhone path as verified on-device execution. The browser webcam/image path against the Mac runtime is the acceptance fallback.

## Why llama.cpp rather than server-side LEAP?

The brief's LEAP choice has changed upstream: Liquid's current quick start explicitly marks LEAP deprecated and recommends llama.cpp. We follow that recommendation for the actual Mac runtime while retaining a pinned LEAP 0.10.7 iOS source path matching the brief. The iOS project uses only `LeapModelDownloader`, avoiding the documented duplicate type problem from also importing `LeapSDK`.

Sources checked during implementation:
- [Liquid LEAP quick start and deprecation notice](https://docs.liquid.ai/deployment/on-device/sdk/quick-start)
- [Official Liquid LFM2.5-VL-450M GGUF weights](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF)

An alert is an observation for a human reviewer, not a conclusive regulatory finding. No face identity or worker scoring is implemented.

## Verified in this workspace

- Homebrew llama.cpp 0.5.0 running with Metal on Apple Silicon; `/health` returned `ok`.
- Real JSON text generation smoke passed: `{"status":"ready","model":"Liquid"}`; server timing ~0.72 seconds.
- Real image inference smoke passed on a generated blank 128×128 PNG: zero workers, no violation, all schema fields valid; server timing ~0.94 seconds.
- Shell syntax, Python compilation, and Swift syntax parsing passed.
- First launch spent about one minute compiling Metal kernels before opening its HTTP port. Wait for `/health` rather than treating this as a model failure.
- These are runtime smoke tests, not a PPE accuracy evaluation or a physical-iPhone test.

- Port-collision smoke passed: with 8089 occupied, a second launcher selected 8090 and returned healthy before shutdown. Original runtime remains on 8089.
- XcodeGen generated the included `.xcodeproj`; both its project file and app Info.plist passed `plutil -lint`.

Native detection defensively normalizes `workers_visible == 0` to `violation: false`, preserving the model’s original Boolean as `model_reported_violation` and recording the normalization. Red banners describe a potential PPE concern, not a confirmed legal violation. The extracted actual Swift parser was executed against empty-frame contradictions and positive worker detections.

The native prompt and parser restrict the configured PPE alert to missing hardhats. When all visible workers wear hardhats, a model's vest-only concern is retained as an observation but normalized to `violation: false` with `hiviz_observation_only`; it does not trigger the head-protection citation.
