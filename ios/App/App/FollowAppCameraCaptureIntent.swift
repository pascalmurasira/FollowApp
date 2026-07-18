import AppIntents

@available(iOS 18.0, *)
struct FollowAppCaptureContext: Codable, Sendable {
    var route: String = "scan"
}

/// The same intent is compiled into the app, control-widget extension and
/// locked capture extension, as required by LockedCameraCapture.
@available(iOS 18.0, *)
struct FollowAppCameraCaptureIntent: CameraCaptureIntent {
    typealias AppContext = FollowAppCaptureContext

    static let title: LocalizedStringResource = "Scan a business card"
    static let description = IntentDescription(
        "Open FollowApp's private business-card capture experience."
    )

    @MainActor
    func perform() async throws -> some IntentResult {
        .result()
    }
}
