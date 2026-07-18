import UIKit

/// Keeps a presented QR easy to scan without permanently changing any device
/// preference. Backgrounding always restores brightness and idle-timer state;
/// foregrounding reapplies them only while the web/native QR sheet still owns
/// an active presentation request.
@MainActor
final class QRPresentationManager {
    private var presentationIds: Set<String> = []
    private var isApplied = false
    private var previousBrightness: CGFloat?
    private var previousIdleTimerDisabled: Bool?

    var isRequested: Bool {
        !presentationIds.isEmpty
    }

    func begin(presentationId: String) {
        presentationIds.insert(presentationId)
        applyIfNeeded()
    }

    func end(presentationId: String) {
        presentationIds.remove(presentationId)
        if presentationIds.isEmpty {
            restoreIfNeeded()
        }
    }

    func endAll() {
        presentationIds.removeAll()
        restoreIfNeeded()
    }

    func applicationDidEnterBackground() {
        restoreIfNeeded()
    }

    func applicationWillEnterForeground() {
        guard isRequested else { return }
        applyIfNeeded()
    }

    private func applyIfNeeded() {
        guard isRequested, !isApplied else { return }
        let screen = UIScreen.main
        previousBrightness = screen.brightness
        previousIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
        screen.brightness = max(screen.brightness, 0.92)
        isApplied = true
    }

    private func restoreIfNeeded() {
        guard isApplied else { return }
        if let previousBrightness {
            UIScreen.main.brightness = previousBrightness
        }
        if let previousIdleTimerDisabled {
            UIApplication.shared.isIdleTimerDisabled = previousIdleTimerDisabled
        }
        self.previousBrightness = nil
        self.previousIdleTimerDisabled = nil
        isApplied = false
    }
}
