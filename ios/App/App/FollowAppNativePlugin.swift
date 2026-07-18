import Capacitor
import UIKit
import Contacts
import ContactsUI
import UserNotifications
import Vision
import VisionKit
import AVFoundation
import ActivityKit
import LockedCameraCapture

enum FollowAppReminderNotification {
    static let identifierPrefix = "followapp-follow-up-"
    static let threadIdentifier = "followapp-follow-ups"
    static let tappedEvent = Notification.Name("followapp.reminder-tapped")

    private static let tappedContactKey = "followapp.reminder-tap.contact-id"
    private static let tappedNotificationKey = "followapp.reminder-tap.notification-id"

    static func isFollowUp(_ request: UNNotificationRequest) -> Bool {
        request.identifier.hasPrefix(identifierPrefix) ||
            request.content.threadIdentifier == threadIdentifier
    }

    static func storeTap(contactId: String, notificationId: String) {
        let defaults = UserDefaults.standard
        defaults.set(contactId, forKey: tappedContactKey)
        defaults.set(notificationId, forKey: tappedNotificationKey)
    }

    static func consumeTap() -> String? {
        let defaults = UserDefaults.standard
        let contactId = defaults.string(forKey: tappedContactKey)
        defaults.removeObject(forKey: tappedContactKey)
        defaults.removeObject(forKey: tappedNotificationKey)
        return contactId
    }

    static func clearTap(notificationId: String) {
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: tappedNotificationKey) == notificationId else {
            return
        }
        defaults.removeObject(forKey: tappedContactKey)
        defaults.removeObject(forKey: tappedNotificationKey)
    }

    static func clearAllTaps() {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: tappedContactKey)
        defaults.removeObject(forKey: tappedNotificationKey)
    }
}

@objc(FollowAppNativePlugin)
public class FollowAppNativePlugin: CAPPlugin, CAPBridgedPlugin, CNContactViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "FollowAppNativePlugin"
    public let jsName = "FollowAppNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveContact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notificationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleFollowUpReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelFollowUpReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAllFollowUpReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeFollowUpReminderTap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizeBusinessCard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "nativeScannerAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanBusinessCard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeLockedCameraCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeSystemEntryPoint", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginQRPresentation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endQRPresentation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentExchangeDock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismissExchangeDock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveActivityStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startEventLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateEventLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endEventLiveActivity", returnType: CAPPluginReturnPromise)
    ]

    private var contactCall: CAPPluginCall?
    private let contactStore = CNContactStore()
    private let reminderGenerationLock = NSLock()
    private var reminderGeneration: UInt64 = 0
    private var reminderIdentifierGenerations: [String: UInt64] = [:]
    private var businessCardScanner: AnyObject?
    private var qrPresentationManager: QRPresentationManager?
    private weak var exchangeDockController: UIViewController?

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleFollowUpReminderTap(notification:)),
            name: FollowAppReminderNotification.tappedEvent,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSystemEntryPoint(notification:)),
            name: FollowAppSystemEntryPointStore.openedNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleApplicationDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleApplicationWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
        DispatchQueue.main.async { [weak self] in
            self?.qrPresentationManager = QRPresentationManager()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        DispatchQueue.main.async { [qrPresentationManager] in
            qrPresentationManager?.endAll()
        }
    }

    @objc private func handleFollowUpReminderTap(notification: Notification) {
        guard let contactId = notification.userInfo?["contactId"] as? String else {
            return
        }
        notifyListeners(
            "followUpReminderTapped",
            data: ["contactId": contactId],
            retainUntilConsumed: true
        )
    }

    @objc private func handleSystemEntryPoint(notification: Notification) {
        guard let route = notification.userInfo?["route"] as? String else { return }
        let url = notification.userInfo?["url"] as? String ?? "followapp://\(route)"
        notifyListeners(
            "systemEntryPointOpened",
            data: ["route": route, "url": url],
            retainUntilConsumed: true
        )
    }

    @objc private func handleApplicationDidEnterBackground() {
        DispatchQueue.main.async { [weak self] in
            self?.qrPresentationManager?.applicationDidEnterBackground()
        }
    }

    @objc private func handleApplicationWillEnterForeground() {
        DispatchQueue.main.async { [weak self] in
            self?.qrPresentationManager?.applicationWillEnterForeground()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let settingsURL = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(settingsURL) else {
                call.reject("FollowApp settings could not be opened.")
                return
            }

            UIApplication.shared.open(settingsURL, options: [:]) { didOpen in
                if didOpen {
                    call.resolve()
                } else {
                    call.reject("FollowApp settings could not be opened.")
                }
            }
        }
    }

    @objc func consumeSystemEntryPoint(_ call: CAPPluginCall) {
        if let entryPoint = FollowAppSystemEntryPointStore.consume() {
            call.resolve([
                "route": entryPoint.rawValue,
                "url": entryPoint.url.absoluteString,
            ])
        } else {
            call.resolve([:])
        }
    }

    @objc func beginQRPresentation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.qrPresentationManager == nil {
                self.qrPresentationManager = QRPresentationManager()
            }
            let presentationId = self.qrPresentationId(from: call)
            self.qrPresentationManager?.begin(presentationId: presentationId)
            call.resolve([
                "active": self.qrPresentationManager?.isRequested == true,
                "presentationId": presentationId
            ])
        }
    }

    @objc func endQRPresentation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let presentationId = self.qrPresentationId(from: call)
            self.qrPresentationManager?.end(presentationId: presentationId)
            call.resolve([
                "active": self.qrPresentationManager?.isRequested == true,
                "presentationId": presentationId
            ])
        }
    }

    private func qrPresentationId(from call: CAPPluginCall) -> String {
        guard let rawValue = call.getString("presentationId")?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              !rawValue.isEmpty else {
            // Maintains compatibility with web bundles installed before
            // presentation generations were added.
            return "legacy"
        }
        return String(rawValue.prefix(160))
    }

    @objc func presentExchangeDock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.exchangeDockController == nil else {
                call.reject("The exchange dock is already open.", "EXCHANGE_DOCK_BUSY")
                return
            }
            guard let root = self.bridge?.viewController,
                  let presenter = self.topViewController(from: root),
                  presenter.viewIfLoaded?.window != nil else {
                call.reject("The exchange dock could not be opened.", "EXCHANGE_DOCK_UNAVAILABLE")
                return
            }

            let controller = NativeExchangeDockFactory.make { [weak self] action in
                guard let self else { return }
                self.notifyListeners(
                    "exchangeDockAction",
                    data: [
                        "action": action.rawValue,
                        "url": "followapp://\(action.rawValue)",
                    ]
                )
                self.exchangeDockController?.dismiss(animated: true)
                self.exchangeDockController = nil
            }
            controller.presentationController?.delegate = self
            self.exchangeDockController = controller
            presenter.present(controller, animated: true) {
                call.resolve(["presented": true])
            }
        }
    }

    @objc func dismissExchangeDock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.exchangeDockController else {
                call.resolve(["dismissed": false])
                return
            }
            controller.dismiss(animated: true) {
                self.exchangeDockController = nil
                call.resolve(["dismissed": true])
            }
        }
    }

    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard presentationController.presentedViewController === exchangeDockController else { return }
        exchangeDockController = nil
    }

    @objc func notificationStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve(["status": self.notificationPermissionName(settings.authorizationStatus)])
        }
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .sound, .badge]
        ) { granted, error in
            if let error {
                call.reject("Reminder permission could not be requested.", "REMINDER_PERMISSION_ERROR", error)
                return
            }
            call.resolve(["status": granted ? "granted" : "denied"])
        }
    }

    @objc func scheduleFollowUpReminder(_ call: CAPPluginCall) {
        guard let identifier = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !identifier.isEmpty,
              let contactId = call.getString("contactId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !contactId.isEmpty,
              let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !title.isEmpty,
              let body = call.getString("body")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !body.isEmpty,
              let date = call.getString("date"),
              let reminderComponents = self.followUpReminderComponents(date),
              let reminderDate = Calendar.current.date(from: reminderComponents),
              reminderDate.timeIntervalSinceNow > 1 else {
            call.reject("A future reminder date is required.", "INVALID_REMINDER")
            return
        }
        let scheduleGeneration = self.reminderScheduleGeneration(identifier: identifier)

        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard self.notificationPermissionName(settings.authorizationStatus) == "granted" else {
                call.reject("Reminder permission is required.", "REMINDER_PERMISSION_REQUIRED")
                return
            }
            guard self.reminderScheduleGenerationIsCurrent(
                scheduleGeneration,
                identifier: identifier
            ) else {
                call.resolve(["scheduled": false])
                return
            }

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.threadIdentifier = FollowAppReminderNotification.threadIdentifier
            content.userInfo = ["contactId": contactId]

            // Date components deliberately carry no timezone. iOS therefore
            // keeps the reminder at 09:00 local time if the user travels.
            let trigger = UNCalendarNotificationTrigger(
                dateMatching: reminderComponents,
                repeats: false
            )
            let request = UNNotificationRequest(
                identifier: identifier,
                content: content,
                trigger: trigger
            )
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            center.removeDeliveredNotifications(withIdentifiers: [identifier])
            center.add(request) { error in
                if let error {
                    call.reject("The follow-up reminder could not be scheduled.", "REMINDER_SCHEDULE_FAILED", error)
                    return
                }
                guard self.reminderScheduleGenerationIsCurrent(
                    scheduleGeneration,
                    identifier: identifier
                ) else {
                    // A contact delete or account/local wipe raced this add.
                    // Never let a late completion recreate the cancelled item.
                    center.removePendingNotificationRequests(withIdentifiers: [identifier])
                    center.removeDeliveredNotifications(withIdentifiers: [identifier])
                    FollowAppReminderNotification.clearTap(notificationId: identifier)
                    call.resolve(["scheduled": false])
                    return
                }
                call.resolve(["scheduled": true])
            }
        }
    }

    @objc func cancelFollowUpReminder(_ call: CAPPluginCall) {
        guard let identifier = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !identifier.isEmpty else {
            call.reject("A reminder id is required.", "INVALID_REMINDER")
            return
        }
        self.invalidateReminderSchedule(identifier: identifier)
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: [identifier]
        )
        UNUserNotificationCenter.current().removeDeliveredNotifications(
            withIdentifiers: [identifier]
        )
        FollowAppReminderNotification.clearTap(notificationId: identifier)
        call.resolve()
    }

    @objc func cancelAllFollowUpReminders(_ call: CAPPluginCall) {
        self.invalidateAllReminderSchedules()
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let pendingIds = pending
                .filter(FollowAppReminderNotification.isFollowUp)
                .map(\.identifier)
            center.removePendingNotificationRequests(withIdentifiers: pendingIds)

            center.getDeliveredNotifications { delivered in
                let deliveredIds = delivered
                    .map(\.request)
                    .filter(FollowAppReminderNotification.isFollowUp)
                    .map(\.identifier)
                center.removeDeliveredNotifications(withIdentifiers: deliveredIds)
                FollowAppReminderNotification.clearAllTaps()
                call.resolve()
            }
        }
    }

    @objc func consumeFollowUpReminderTap(_ call: CAPPluginCall) {
        if let contactId = FollowAppReminderNotification.consumeTap() {
            call.resolve(["contactId": contactId])
        } else {
            call.resolve([:])
        }
    }

    private func notificationPermissionName(
        _ status: UNAuthorizationStatus
    ) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return "granted"
        case .denied:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "unsupported"
        }
    }

    private func reminderScheduleGeneration(
        identifier: String
    ) -> (all: UInt64, identifier: UInt64) {
        reminderGenerationLock.lock()
        defer { reminderGenerationLock.unlock() }
        return (
            reminderGeneration,
            reminderIdentifierGenerations[identifier] ?? 0
        )
    }

    private func reminderScheduleGenerationIsCurrent(
        _ generation: (all: UInt64, identifier: UInt64),
        identifier: String
    ) -> Bool {
        reminderGenerationLock.lock()
        defer { reminderGenerationLock.unlock() }
        return reminderGeneration == generation.all &&
            (reminderIdentifierGenerations[identifier] ?? 0) == generation.identifier
    }

    private func invalidateReminderSchedule(identifier: String) {
        reminderGenerationLock.lock()
        reminderIdentifierGenerations[identifier, default: 0] &+= 1
        reminderGenerationLock.unlock()
    }

    private func invalidateAllReminderSchedules() {
        reminderGenerationLock.lock()
        reminderGeneration &+= 1
        reminderIdentifierGenerations.removeAll(keepingCapacity: false)
        reminderGenerationLock.unlock()
    }

    private func followUpReminderComponents(_ value: String) -> DateComponents? {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4,
              parts[1].count == 2,
              parts[2].count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else {
            return nil
        }

        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 9
        components.minute = 0
        components.second = 0

        guard let parsed = Calendar.current.date(from: components) else { return nil }
        let verified = Calendar.current.dateComponents([.year, .month, .day], from: parsed)
        guard verified.year == year,
              verified.month == month,
              verified.day == day else {
            return nil
        }
        return components
    }

    @objc func nativeScannerAvailability(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let permission: String
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                permission = "granted"
            case .denied, .restricted:
                permission = "denied"
            case .notDetermined:
                permission = "prompt"
            @unknown default:
                permission = "unsupported"
            }

            if #available(iOS 16.0, *) {
                call.resolve([
                    "supported": DataScannerViewController.isSupported,
                    "available": BusinessCardScannerCoordinator.isSupported,
                    "permission": permission,
                ])
            } else {
                call.resolve([
                    "supported": false,
                    "available": false,
                    "permission": permission,
                ])
            }
        }
    }

    @objc func scanBusinessCard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.businessCardScanner == nil else {
                call.reject("The live card scanner is already open.", "SCANNER_BUSY")
                return
            }

            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.presentBusinessCardScanner(call)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    DispatchQueue.main.async {
                        if granted {
                            self.presentBusinessCardScanner(call)
                        } else {
                            call.resolve([
                                "available": false,
                                "reason": "permission-denied",
                            ])
                        }
                    }
                }
            case .denied, .restricted:
                call.resolve([
                    "available": false,
                    "reason": "permission-denied",
                ])
            @unknown default:
                call.resolve([
                    "available": false,
                    "reason": "unsupported",
                ])
            }
        }
    }

    @available(iOS 16.0, *)
    private func makeBusinessCardScanner(
        presenter: UIViewController,
        call: CAPPluginCall
    ) -> BusinessCardScannerCoordinator? {
        BusinessCardScannerCoordinator(presenter: presenter) { [weak self] result in
            self?.businessCardScanner = nil
            guard let result else {
                call.resolve(["available": true, "cancelled": true])
                return
            }
            switch result {
            case .success(let scan):
                call.resolve([
                    "available": true,
                    "cancelled": false,
                    "lines": scan.lines,
                    "text": scan.lines.joined(separator: "\n"),
                    "qrPayloads": scan.qrPayloads,
                    "elapsedMilliseconds": scan.elapsedMilliseconds,
                ])
            case .failure(let error):
                call.reject(
                    error.localizedDescription,
                    "LIVE_SCANNER_FAILED",
                    error
                )
            }
        }
    }

    private func presentBusinessCardScanner(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["available": false, "reason": "unsupported"])
            return
        }
        guard BusinessCardScannerCoordinator.isSupported else {
            call.resolve(["available": false, "reason": "unavailable"])
            return
        }
        guard let root = bridge?.viewController,
              let presenter = topViewController(from: root),
              presenter.viewIfLoaded?.window != nil,
              !presenter.isBeingDismissed else {
            call.reject("The live card scanner could not be opened.", "SCANNER_UNAVAILABLE")
            return
        }
        guard let scanner = makeBusinessCardScanner(presenter: presenter, call: call) else {
            call.resolve(["available": false, "reason": "unavailable"])
            return
        }
        businessCardScanner = scanner
        scanner.present()
    }

    /// Local, on-device preliminary OCR. Cloud parsing can enrich these lines
    /// later, but the user sees useful card text without a network round trip.
    @objc func recognizeBusinessCard(_ call: CAPPluginCall) {
        guard let encodedImage = call.getString("image")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !encodedImage.isEmpty,
              encodedImage.count <= 30_000_000 else {
            call.reject("A valid business-card image is required.", "INVALID_IMAGE")
            return
        }
        let payload = encodedImage.split(separator: ",", maxSplits: 1).last.map(String.init) ?? encodedImage
        guard let data = Data(base64Encoded: payload, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data),
              let cgImage = image.cgImage else {
            call.reject("The business-card image could not be decoded.", "INVALID_IMAGE")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            if #available(iOS 16.0, *) {
                request.automaticallyDetectsLanguage = true
            }

            do {
                try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
                let observations = (request.results ?? []).sorted { left, right in
                    let verticalDifference = left.boundingBox.maxY - right.boundingBox.maxY
                    if abs(verticalDifference) > 0.025 { return verticalDifference > 0 }
                    return left.boundingBox.minX < right.boundingBox.minX
                }
                let candidates = observations.compactMap { $0.topCandidates(1).first }
                let lines = candidates
                    .map { $0.string.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                let averageConfidence = candidates.isEmpty
                    ? 0
                    : candidates.reduce(0.0) { $0 + Double($1.confidence) } /
                        Double(candidates.count)
                call.resolve([
                    "lines": lines,
                    "text": lines.joined(separator: "\n"),
                    "averageConfidence": averageConfidence
                ])
            } catch {
                call.reject("Business-card text recognition failed.", "OCR_FAILED", error)
            }
        }
    }

    @objc func consumeLockedCameraCapture(_ call: CAPPluginCall) {
        guard #available(iOS 18.0, *) else {
            call.resolve(["available": false])
            return
        }

        Task {
            let manager = LockedCameraCaptureManager.shared
            var capture: (session: URL, file: URL)?

            // Session content can arrive just after the containing app opens.
            // Poll briefly so the web layer does not need its own race-prone
            // retry loop.
            for _ in 0..<20 {
                capture = self.latestLockedCameraCapture(
                    in: manager.sessionContentURLs
                )
                if capture != nil { break }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }

            guard let capture else {
                call.resolve(["available": true])
                return
            }

            do {
                let source = try Data(contentsOf: capture.file, options: [.mappedIfSafe])
                guard source.count <= 30_000_000,
                      let image = UIImage(data: source),
                      let jpeg = image.jpegData(compressionQuality: 0.84) else {
                    call.reject("The Lock Screen capture could not be decoded.", "LOCKED_CAPTURE_INVALID")
                    return
                }
                let dataURL = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
                try? await manager.invalidateSessionContent(at: capture.session)
                call.resolve([
                    "available": true,
                    "image": dataURL,
                    "source": "locked-camera",
                ])
            } catch {
                call.reject(
                    "The Lock Screen capture could not be read.",
                    "LOCKED_CAPTURE_READ_FAILED",
                    error
                )
            }
        }
    }

    private func latestLockedCameraCapture(
        in sessionURLs: [URL]
    ) -> (session: URL, file: URL)? {
        let allowedExtensions = Set(["jpg", "jpeg", "png", "heic", "heif"])
        var candidates: [(session: URL, file: URL, date: Date)] = []

        for sessionURL in sessionURLs {
            guard let enumerator = FileManager.default.enumerator(
                at: sessionURL,
                includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey],
                options: [.skipsHiddenFiles]
            ) else { continue }
            for case let fileURL as URL in enumerator {
                guard allowedExtensions.contains(fileURL.pathExtension.lowercased()) else { continue }
                let values = try? fileURL.resourceValues(
                    forKeys: [.contentModificationDateKey, .isRegularFileKey]
                )
                guard values?.isRegularFile == true else { continue }
                candidates.append((
                    session: sessionURL,
                    file: fileURL,
                    date: values?.contentModificationDate ?? .distantPast
                ))
            }
        }

        return candidates.max(by: { $0.date < $1.date }).map {
            (session: $0.session, file: $0.file)
        }
    }

    @objc func liveActivityStatus(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["supported": false, "enabled": false, "activities": []])
            return
        }
        let activities = Activity<FollowAppEventAttributes>.activities.map { activity in
            [
                "id": activity.id,
                "eventId": activity.attributes.eventID,
                "eventName": activity.attributes.eventName,
            ]
        }
        call.resolve([
            "supported": true,
            "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
            "activities": activities,
        ])
    }

    @objc func startEventLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["started": false, "reason": "unsupported"])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false, "reason": "disabled"])
            return
        }
        guard let eventID = bounded(call.getString("eventId"), max: 160),
              let eventName = bounded(call.getString("eventName"), max: 120) else {
            call.reject("An event id and name are required.", "INVALID_EVENT_ACTIVITY")
            return
        }
        let state = FollowAppEventAttributes.ContentState(
            capturedCount: boundedCount(call.getInt("captured")),
            promiseCount: boundedCount(call.getInt("promises"))
        )

        Task {
            for activity in Activity<FollowAppEventAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            do {
                let activity = try Activity.request(
                    attributes: FollowAppEventAttributes(
                        eventID: eventID,
                        eventName: eventName
                    ),
                    content: ActivityContent(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve(["started": true, "id": activity.id])
            } catch {
                call.reject(
                    "The conference Live Activity could not be started.",
                    "LIVE_ACTIVITY_START_FAILED",
                    error
                )
            }
        }
    }

    @objc func updateEventLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["updated": false, "reason": "unsupported"])
            return
        }
        let requestedEventID = bounded(call.getString("eventId"), max: 160)
        let state = FollowAppEventAttributes.ContentState(
            capturedCount: boundedCount(call.getInt("captured")),
            promiseCount: boundedCount(call.getInt("promises"))
        )
        let activity = Activity<FollowAppEventAttributes>.activities.first { item in
            requestedEventID == nil || item.attributes.eventID == requestedEventID
        }
        guard let activity else {
            call.resolve(["updated": false, "reason": "not-found"])
            return
        }

        Task {
            await activity.update(ActivityContent(state: state, staleDate: nil))
            call.resolve(["updated": true, "id": activity.id])
        }
    }

    @objc func endEventLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ended": 0])
            return
        }
        let requestedEventID = bounded(call.getString("eventId"), max: 160)
        let matches = Activity<FollowAppEventAttributes>.activities.filter { item in
            requestedEventID == nil || item.attributes.eventID == requestedEventID
        }
        let finalState = FollowAppEventAttributes.ContentState(
            capturedCount: boundedCount(call.getInt("captured")),
            promiseCount: boundedCount(call.getInt("promises"))
        )

        Task {
            for activity in matches {
                await activity.end(
                    ActivityContent(state: finalState, staleDate: nil),
                    dismissalPolicy: .default
                )
            }
            call.resolve(["ended": matches.count])
        }
    }

    private func bounded(_ value: String?, max: Int) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty else { return nil }
        return String(normalized.prefix(max))
    }

    private func boundedCount(_ value: Int?) -> Int {
        Swift.max(0, Swift.min(value ?? 0, 10_000))
    }

    @objc func saveContact(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.contactCall == nil else {
                call.reject("Contact editor is already open.", "CONTACT_BUSY")
                return
            }
            guard let name = call.getString("n")?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !name.isEmpty else {
                call.reject("A contact name is required.", "INVALID_CONTACT")
                return
            }
            guard let viewController = self.bridge?.viewController,
                  let presenter = self.topViewController(from: viewController),
                  presenter.viewIfLoaded?.window != nil,
                  !presenter.isBeingDismissed else {
                call.reject("Contacts could not be opened.", "CONTACT_UNAVAILABLE")
                return
            }

            let contact = CNMutableContact()
            let components = PersonNameComponentsFormatter().personNameComponents(from: name)
            contact.givenName = components?.givenName ?? name
            contact.middleName = components?.middleName ?? ""
            contact.familyName = components?.familyName ?? ""
            contact.jobTitle = call.getString("t") ?? ""
            contact.organizationName = call.getString("co") ?? ""
            if let phone = call.getString("p"), !phone.isEmpty {
                contact.phoneNumbers = [
                    CNLabeledValue(
                        label: CNLabelPhoneNumberMobile,
                        value: CNPhoneNumber(stringValue: phone)
                    )
                ]
            }
            if let email = call.getString("e"), !email.isEmpty {
                contact.emailAddresses = [
                    CNLabeledValue(label: CNLabelWork, value: email as NSString)
                ]
            }

            let editor = CNContactViewController(forNewContact: contact)
            // ContactsUI deliberately disables Add/Done when no store is set.
            // Keep one store for the plugin lifetime and give it to every new
            // contact editor so the reviewed card can actually be committed.
            editor.contactStore = self.contactStore
            editor.delegate = self
            let navigationController = UINavigationController(rootViewController: editor)
            navigationController.modalPresentationStyle =
                UIDevice.current.userInterfaceIdiom == .pad ? .formSheet : .fullScreen
            navigationController.isModalInPresentation = true
            self.contactCall = call
            let presentationStartedAt = ProcessInfo.processInfo.systemUptime
            presenter.present(navigationController, animated: true) {
                let elapsedMilliseconds = Int(
                    (ProcessInfo.processInfo.systemUptime - presentationStartedAt) * 1_000
                )
                NSLog("[FollowApp] Contact editor presented in %d ms.", elapsedMilliseconds)
            }

            // UIKit can decline a presentation during another controller's
            // transition without completing the bridge call. Reject that case
            // instead of leaving the web UI permanently busy.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self, weak navigationController] in
                guard let self,
                      self.contactCall === call,
                      let navigationController,
                      navigationController.presentingViewController == nil ||
                        navigationController.viewIfLoaded?.window == nil else {
                    return
                }
                self.contactCall = nil
                call.reject("Contacts could not be opened.", "CONTACT_PRESENTATION_FAILED")
            }
        }
    }

    public func contactViewController(
        _ viewController: CNContactViewController,
        didCompleteWith contact: CNContact?
    ) {
        let call = contactCall
        contactCall = nil
        viewController.navigationController?.dismiss(animated: true) {
            call?.resolve(["saved": contact != nil])
        }
    }

    private func topViewController(from root: UIViewController?) -> UIViewController? {
        if let navigationController = root as? UINavigationController {
            return topViewController(from: navigationController.visibleViewController)
        }

        if let tabBarController = root as? UITabBarController {
            return topViewController(from: tabBarController.selectedViewController)
        }

        if let presented = root?.presentedViewController, !presented.isBeingDismissed {
            return topViewController(from: presented)
        }

        return root
    }

}
