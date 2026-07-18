import AppIntents
import Foundation

enum FollowAppSystemEntryPoint: String {
    case scan
    case myQR = "my-qr"
    case event

    var url: URL {
        URL(string: "followapp://\(rawValue)")!
    }
}

enum FollowAppSystemEntryPointStore {
    static let openedNotification = Notification.Name("followapp.system-entry-point")
    private static let pendingKey = "followapp.system-entry-point.pending"

    static func entryPoint(for url: URL) -> FollowAppSystemEntryPoint? {
        guard url.scheme?.lowercased() == "followapp",
              url.user == nil,
              url.password == nil,
              url.query == nil,
              url.fragment == nil,
              url.port == nil else { return nil }
        let route = [url.host, url.path]
            .compactMap { $0 }
            .joined(separator: "/")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .lowercased()
        return FollowAppSystemEntryPoint(rawValue: route)
    }

    static func record(_ entryPoint: FollowAppSystemEntryPoint) {
        UserDefaults.standard.set(entryPoint.rawValue, forKey: pendingKey)
        NotificationCenter.default.post(
            name: openedNotification,
            object: nil,
            userInfo: ["route": entryPoint.rawValue, "url": entryPoint.url.absoluteString]
        )
    }

    static func consume() -> FollowAppSystemEntryPoint? {
        let defaults = UserDefaults.standard
        guard let value = defaults.string(forKey: pendingKey),
              let entryPoint = FollowAppSystemEntryPoint(rawValue: value) else {
            return nil
        }
        defaults.removeObject(forKey: pendingKey)
        return entryPoint
    }
}

@available(iOS 16.0, *)
struct ShowFollowAppQRIntent: AppIntent {
    static let title: LocalizedStringResource = "Show my FollowApp QR"
    static let description = IntentDescription(
        "Open your digital card so another person can scan it."
    )
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        FollowAppSystemEntryPointStore.record(.myQR)
        return .result()
    }
}

@available(iOS 16.0, *)
struct OpenFollowAppEventIntent: AppIntent {
    static let title: LocalizedStringResource = "Open conference mode"
    static let description = IntentDescription(
        "Open the active event and its promise queue in FollowApp."
    )
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        FollowAppSystemEntryPointStore.record(.event)
        return .result()
    }
}

@available(iOS 18.0, *)
struct FollowAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: FollowAppCameraCaptureIntent(),
            phrases: [
                "Scan a card with \(.applicationName)",
                "Capture a contact with \(.applicationName)",
            ],
            shortTitle: "Scan card",
            systemImageName: "person.crop.rectangle"
        )
        AppShortcut(
            intent: ShowFollowAppQRIntent(),
            phrases: ["Show my QR in \(.applicationName)"],
            shortTitle: "My QR",
            systemImageName: "qrcode"
        )
        AppShortcut(
            intent: OpenFollowAppEventIntent(),
            phrases: ["Open conference mode in \(.applicationName)"],
            shortTitle: "Conference mode",
            systemImageName: "person.3"
        )
    }

    static var shortcutTileColor: ShortcutTileColor { .navy }
}
