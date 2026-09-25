import SwiftUI
import AVFoundation
import UIKit
import LeapModelDownloader

@main
struct SiteLensApp: App {
    var body: some Scene { WindowGroup { DetectorView() } }
}

struct Detection: Codable {
    let workers_visible: Int
    let all_wearing_hardhats: Bool
    let all_wearing_hiviz: Bool
    let violation: Bool
    let description: String
    var model_reported_violation: Bool? = nil
    var normalization: String? = nil
}

struct DetectorView: View {
    @StateObject private var model = DetectorModel()
    var body: some View {
        VStack(spacing: 14) {
            Text("SiteLens · ZONE-A").font(.title2.bold())
            CameraPreview(session: model.camera.session).clipShape(RoundedRectangle(cornerRadius: 16))
            Text(model.banner).font(.headline).frame(maxWidth: .infinity).padding()
                .background(model.violation ? Color.red : Color.blue.opacity(0.25)).cornerRadius(12)
            TextField("Backend URL, e.g. http://192.168.1.10:8000", text: $model.backend)
                .textFieldStyle(.roundedBorder).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            Toggle("On-device Liquid (downloads model once)", isOn: $model.onDevice).disabled(model.running)
            Text(model.onDevice ? "Liquid LEAP on this iPhone · no frames leave device" : "Local Mac Liquid fallback · frames sent to your backend")
                .font(.caption).foregroundStyle(.secondary)
            Button(model.running ? "Stop inspection" : "Start inspection") {
                model.running ? model.stop() : model.start()
            }.buttonStyle(.borderedProminent).disabled(model.loading)
            Text(model.status).font(.caption).frame(maxWidth: .infinity, alignment: .leading)
        }.padding().task { await model.camera.prepare() }
    }
}

@MainActor
final class DetectorModel: ObservableObject {
    @Published var banner = "Ready to inspect"
    @Published var status = "Choose a backend URL and start. No person identities are stored."
    @Published var backend = "http://192.168.1.10:8000"
    @Published var onDevice = true
    @Published var running = false
    @Published var loading = false
    @Published var violation = false
    let camera = CameraController()
    private var runner: ModelRunner?
    private var loop: Task<Void, Never>?
    private lazy var downloader = ModelDownloader(config: LeapDownloaderConfig(saveDir:
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("leap_models").path))
    private let prompt = "You are a construction safety inspector. Look at this image. Reply ONLY with JSON: {\"workers_visible\": int, \"all_wearing_hardhats\": bool, \"all_wearing_hiviz\": bool, \"violation\": bool, \"description\": string}. The configured ZONE-A rule covers hardhats only. Set violation true only when visible workers are missing hardhats. Missing high-visibility clothing is an observation only, not a violation under this rule. No visible people means no violation."

    func start() {
        running = true; banner = "Starting inspection…"
        loop = Task {
            do {
                if onDevice && runner == nil {
                    loading = true; status = "Downloading Liquid LFM2.5-VL-450M…"
                    runner = try await downloader.loadModel(modelName: "LFM2.5-VL-450M", quantizationType: "Q4_K_M") { fraction, _ in
                        Task { @MainActor in self.status = "Loading Liquid: \(Int(fraction * 100))%" }
                    }
                    loading = false
                }
                while !Task.isCancelled {
                    guard let jpeg = camera.latestJPEG else {
                        status = camera.error ?? "Waiting for camera permission and first frame…"
                        try await Task.sleep(nanoseconds: 1_000_000_000); continue
                    }
                    status = "Inspecting frame…"
                    if onDevice {
                        guard let runner else { throw URLError(.cannotLoadFromNetwork) }
                        // A NEW conversation each frame: discarded pixels never grow working context.
                        let conversation = runner.createConversation(systemPrompt: "Return the requested JSON only.")
                        let message = ChatMessage(role: .user, content: [.text(prompt), ChatMessageContent.fromJPEGData(jpeg)], reasoningContent: nil, functionCalls: nil)
                        var output = ""
                        for try await response in conversation.generateResponse(message: message, generationOptions: GenerationOptions().with(temperature: 0.0)) {
                            if case .chunk(let chunk) = onEnum(of: response) { output += chunk.text }
                        }
                        let detection = try Self.parse(output)
                        violation = detection.violation
                        banner = violation ? "POTENTIAL PPE CONCERN · \(detection.description)" : "No PPE violation detected"
                        if detection.violation {
                            let payload = try JSONSerialization.jsonObject(with: JSONEncoder().encode(detection))
                            let event: [String: Any] = ["event_id": UUID().uuidString, "ts": ISO8601DateFormatter().string(from: Date()), "source": "iphone-1", "type": "ppe_violation", "zone": "ZONE-A", "detector_payload": payload]
                            _ = try await post("events", event)
                            status = "Alert delivered to dashboard · Liquid on-device"
                        } else { status = "Inspection complete · Liquid on-device" }
                    } else {
                        let data = try await post("api/detect", ["image": "data:image/jpeg;base64," + jpeg.base64EncodedString(), "source": "iphone-1", "zone": "ZONE-A"])
                        let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                        if let payload = (result?["detector_payload"] ?? result?["detection"]) as? [String: Any] {
                            violation = payload["violation"] as? Bool ?? false
                            banner = violation ? "POTENTIAL PPE CONCERN · \(payload["description"] as? String ?? "Review dashboard")" : "No PPE violation detected"
                        } else { banner = "Frame inspected · check dashboard" }
                        status = "Local Mac Liquid inspection complete"
                    }
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                }
            } catch is CancellationError { status = "Inspection stopped" }
            catch { status = "Inspection failed: \(error.localizedDescription)"; banner = "Inspection unavailable · retry" }
            running = false; loading = false
        }
    }
    func stop() { loop?.cancel(); running = false; banner = "Inspection stopped"; status = "Stopped" }
    private func post(_ path: String, _ object: [String: Any]) async throws -> Data {
        guard let base = URL(string: backend), ["http", "https"].contains(base.scheme ?? "") else { throw URLError(.badURL) }
        var request = URLRequest(url: base.appendingPathComponent(path)); request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: object); request.timeoutInterval = 120
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.badServerResponse) }
        return data
    }
    static func parse(_ text: String) throws -> Detection {
        guard let first = text.firstIndex(of: "{"), let last = text.lastIndex(of: "}") else { throw URLError(.cannotParseResponse) }
        let result = try JSONDecoder().decode(Detection.self, from: Data(text[first...last].utf8))
        guard result.workers_visible >= 0 else { throw URLError(.cannotParseResponse) }
        if result.workers_visible == 0 || result.all_wearing_hardhats {
            return Detection(workers_visible: result.workers_visible,
                all_wearing_hardhats: result.all_wearing_hardhats,
                all_wearing_hiviz: result.all_wearing_hiviz,
                violation: false, description: result.description,
                model_reported_violation: result.model_reported_violation ?? result.violation,
                normalization: result.workers_visible == 0 ? "no_workers_no_ppe_violation" : "hiviz_observation_only")
        }
        return result
    }
}

final class CameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "ai.sitelens.camera")
    private let lock = NSLock()
    private var storedJPEG: Data?
    var latestJPEG: Data? { lock.lock(); defer { lock.unlock() }; return storedJPEG }
    var error: String?
    func prepare() async {
        guard await AVCaptureDevice.requestAccess(for: .video) else { error = "Camera access denied. Enable it in Settings."; return }
        queue.async {
            do {
                self.session.beginConfiguration(); defer { self.session.commitConfiguration() }
                self.session.sessionPreset = .vga640x480
                guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { throw URLError(.resourceUnavailable) }
                let input = try AVCaptureDeviceInput(device: device)
                guard self.session.canAddInput(input) else { throw URLError(.resourceUnavailable) }
                self.session.addInput(input)
                let output = AVCaptureVideoDataOutput(); output.alwaysDiscardsLateVideoFrames = true
                output.setSampleBufferDelegate(self, queue: self.queue)
                guard self.session.canAddOutput(output) else { throw URLError(.resourceUnavailable) }
                self.session.addOutput(output)
                if let connection = output.connection(with: .video), connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
                self.queue.async { self.session.startRunning() }
            } catch { self.error = error.localizedDescription }
        }
    }
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let jpeg = UIImage(ciImage: CIImage(cvPixelBuffer: buffer)).jpegData(compressionQuality: 0.65)
        lock.lock(); storedJPEG = jpeg; lock.unlock()
    }
}
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PreviewUIView { let view = PreviewUIView(); view.layerView.session = session; view.layerView.videoGravity = .resizeAspectFill; return view }
    func updateUIView(_ uiView: PreviewUIView, context: Context) {}
}
final class PreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var layerView: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}
