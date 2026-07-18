import Capacitor
import UIKit
import Contacts
import ContactsUI
import UserNotifications
import Vision

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
public class FollowAppNativePlugin: CAPPlugin, CAPBridgedPlugin, CNContactViewControllerDelegate {
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
        CAPPluginMethod(name: "recognizeBusinessCard", returnType: CAPPluginReturnPromise)
    ]

    private var contactCall: CAPPluginCall?
    private let contactStore = CNContactStore()
    private let reminderGenerationLock = NSLock()
    private var reminderGeneration: UInt64 = 0
    private var reminderIdentifierGenerations: [String: UInt64] = [:]

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleFollowUpReminderTap(notification:)),
            name: FollowAppReminderNotification.tappedEvent,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
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
