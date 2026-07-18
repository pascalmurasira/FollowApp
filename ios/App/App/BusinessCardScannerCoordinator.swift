import AVFoundation
import UIKit
import Vision
import VisionKit

struct BusinessCardScannerResult {
    let lines: [String]
    let qrPayloads: [String]
    let elapsedMilliseconds: Int
}

enum BusinessCardScannerError: LocalizedError {
    case unavailable
    case presentationFailed
    case scanningFailed(Error)

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Live card scanning is unavailable on this device."
        case .presentationFailed:
            return "The live card scanner could not be opened."
        case .scanningFailed(let error):
            return "Live card scanning stopped: \(error.localizedDescription)"
        }
    }
}

/// A focused, on-device business-card scanner. VisionKit owns the capture
/// session and renders its live recognition highlights; FollowApp adds only the
/// minimum controls required to confirm or cancel a scan.
@available(iOS 16.0, *)
@MainActor
final class BusinessCardScannerCoordinator: NSObject, DataScannerViewControllerDelegate {
    typealias Completion = (Result<BusinessCardScannerResult, Error>?) -> Void

    private weak var presenter: UIViewController?
    private let scanner: DataScannerViewController
    private let completion: Completion
    private let startedAt = ProcessInfo.processInfo.systemUptime
    private var recognizedItems: [RecognizedItem] = []
    private var didFinish = false
    private var stableSignature: String?
    private var autoConfirmWorkItem: DispatchWorkItem?

    private let statusLabel = UILabel()
    private let previewLabel = UILabel()
    private let useButton = UIButton(type: .system)

    static var isSupported: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    init?(presenter: UIViewController, completion: @escaping Completion) {
        guard Self.isSupported else { return nil }

        self.presenter = presenter
        self.completion = completion
        scanner = DataScannerViewController(
            recognizedDataTypes: [
                .text(languages: [], textContentType: nil),
                .barcode(symbologies: [.qr]),
            ],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        super.init()
        scanner.delegate = self
        configureOverlay()
    }

    func present() {
        guard let presenter, presenter.viewIfLoaded?.window != nil else {
            finish(.failure(BusinessCardScannerError.presentationFailed), dismiss: false)
            return
        }

        scanner.modalPresentationStyle = .fullScreen
        presenter.present(scanner, animated: true) { [weak self] in
            guard let self else { return }
            do {
                try self.scanner.startScanning()
            } catch {
                self.finish(.failure(BusinessCardScannerError.scanningFailed(error)))
            }
        }

        // UIKit can decline a presentation while another controller is in
        // transition. Never leave the Capacitor promise pending in that case.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self, !self.didFinish else { return }
            guard self.scanner.presentingViewController != nil,
                  self.scanner.viewIfLoaded?.window != nil else {
                self.finish(.failure(BusinessCardScannerError.presentationFailed), dismiss: false)
                return
            }
        }
    }

    private func configureOverlay() {
        let overlay = scanner.overlayContainerView
        overlay.isUserInteractionEnabled = true

        let closeButton = UIButton(type: .system)
        closeButton.accessibilityLabel = "Close scanner"
        closeButton.configuration = circularButtonConfiguration(
            title: nil,
            systemImage: "xmark"
        )
        closeButton.addAction(UIAction { [weak self] _ in
            self?.finish(nil)
        }, for: .touchUpInside)

        let titleLabel = UILabel()
        titleLabel.text = "Scan a business card"
        titleLabel.textColor = .white
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.layer.shadowColor = UIColor.black.cgColor
        titleLabel.layer.shadowOpacity = 0.5
        titleLabel.layer.shadowRadius = 4

        let header = UIStackView(arrangedSubviews: [titleLabel, closeButton])
        header.axis = .horizontal
        header.alignment = .center
        header.spacing = 12
        closeButton.widthAnchor.constraint(equalToConstant: 48).isActive = true
        closeButton.heightAnchor.constraint(equalToConstant: 48).isActive = true

        statusLabel.text = "Hold the card steady. Details appear as they are recognised."
        statusLabel.textColor = .secondaryLabel
        statusLabel.font = .preferredFont(forTextStyle: .subheadline)
        statusLabel.adjustsFontForContentSizeCategory = true
        statusLabel.numberOfLines = 2

        previewLabel.text = "Looking for a name, company, email and phone…"
        previewLabel.textColor = .label
        previewLabel.font = .preferredFont(forTextStyle: .body)
        previewLabel.adjustsFontForContentSizeCategory = true
        previewLabel.numberOfLines = 3

        useButton.configuration = primaryButtonConfiguration(title: "Use detected details")
        useButton.isEnabled = false
        useButton.addAction(UIAction { [weak self] _ in
            self?.confirmCurrentItems()
        }, for: .touchUpInside)

        let contentStack = UIStackView(arrangedSubviews: [statusLabel, previewLabel, useButton])
        contentStack.axis = .vertical
        contentStack.spacing = 10
        contentStack.isLayoutMarginsRelativeArrangement = true
        contentStack.directionalLayoutMargins = NSDirectionalEdgeInsets(
            top: 16,
            leading: 16,
            bottom: 16,
            trailing: 16
        )

        let materialView: UIVisualEffectView
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .regular)
            glass.isInteractive = true
            glass.tintColor = UIColor.systemBackground.withAlphaComponent(0.12)
            materialView = UIVisualEffectView(effect: glass)
        } else {
            materialView = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))
        }
        materialView.layer.cornerCurve = .continuous
        materialView.layer.cornerRadius = 24
        materialView.clipsToBounds = true
        materialView.contentView.addSubview(contentStack)

        [header, materialView, contentStack].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }
        overlay.addSubview(header)
        overlay.addSubview(materialView)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor, constant: 12),
            header.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 20),
            header.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -20),

            materialView.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 16),
            materialView.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -16),
            materialView.bottomAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.bottomAnchor, constant: -12),

            contentStack.topAnchor.constraint(equalTo: materialView.contentView.topAnchor),
            contentStack.leadingAnchor.constraint(equalTo: materialView.contentView.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: materialView.contentView.trailingAnchor),
            contentStack.bottomAnchor.constraint(equalTo: materialView.contentView.bottomAnchor),
            useButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 50),
        ])
    }

    private func circularButtonConfiguration(title: String?, systemImage: String) -> UIButton.Configuration {
        var configuration: UIButton.Configuration
        if #available(iOS 26.0, *) {
            configuration = .glass()
        } else {
            configuration = .filled()
            configuration.baseBackgroundColor = UIColor.black.withAlphaComponent(0.42)
        }
        configuration.title = title
        configuration.image = UIImage(systemName: systemImage)
        configuration.baseForegroundColor = .white
        configuration.cornerStyle = .capsule
        return configuration
    }

    private func primaryButtonConfiguration(title: String) -> UIButton.Configuration {
        var configuration: UIButton.Configuration
        if #available(iOS 26.0, *) {
            configuration = .prominentGlass()
        } else {
            configuration = .filled()
        }
        configuration.title = title
        configuration.image = UIImage(systemName: "checkmark")
        configuration.imagePadding = 8
        configuration.baseBackgroundColor = UIColor(
            red: 20 / 255,
            green: 45 / 255,
            blue: 76 / 255,
            alpha: 1
        )
        configuration.baseForegroundColor = .white
        configuration.cornerStyle = .capsule
        return configuration
    }

    private func update(items: [RecognizedItem]) {
        recognizedItems = items
        let lines = normalizedTextLines(from: items)
        let qrPayloads = normalizedQRPayloads(from: items)
        let previews = Array(lines.prefix(3)) + Array(qrPayloads.prefix(1))

        if previews.isEmpty {
            cancelAutoConfirm()
            statusLabel.text = "Hold the card steady. Details appear as they are recognised."
            previewLabel.text = "Looking for a name, company, email and phone…"
            useButton.isEnabled = false
        } else {
            statusLabel.text = "Detected live on this iPhone · hold steady"
            previewLabel.text = previews.joined(separator: "\n")
            useButton.isEnabled = true
            scheduleAutoConfirmIfPlausible(lines: lines, qrPayloads: qrPayloads)
        }
    }

    private func scheduleAutoConfirmIfPlausible(lines: [String], qrPayloads: [String]) {
        let hasEmail = lines.contains { $0.contains("@") }
        let hasPhone = lines.contains { line in
            let digits = line.filter(\.isNumber)
            return digits.count >= 8 && digits.count <= 15
        }
        let plausible = !qrPayloads.isEmpty || lines.count >= 3 ||
            (lines.count >= 2 && (hasEmail || hasPhone))
        guard plausible else {
            cancelAutoConfirm()
            return
        }

        let signature = (lines + qrPayloads).joined(separator: "\u{1F}")
        guard signature != stableSignature else { return }
        cancelAutoConfirm()
        stableSignature = signature

        let workItem = DispatchWorkItem { [weak self] in
            guard let self, !self.didFinish, self.stableSignature == signature else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            self.confirmCurrentItems()
        }
        autoConfirmWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: workItem)
    }

    private func cancelAutoConfirm() {
        autoConfirmWorkItem?.cancel()
        autoConfirmWorkItem = nil
        stableSignature = nil
    }

    private func confirmCurrentItems() {
        let lines = normalizedTextLines(from: recognizedItems)
        let qrPayloads = normalizedQRPayloads(from: recognizedItems)
        guard !lines.isEmpty || !qrPayloads.isEmpty else { return }
        let elapsed = Int((ProcessInfo.processInfo.systemUptime - startedAt) * 1_000)
        finish(.success(BusinessCardScannerResult(
            lines: lines,
            qrPayloads: qrPayloads,
            elapsedMilliseconds: elapsed
        )))
    }

    private func normalizedTextLines(from items: [RecognizedItem]) -> [String] {
        let ordered = items.compactMap { item -> RecognizedItem.Text? in
            guard case .text(let text) = item else { return nil }
            return text
        }.sorted { left, right in
            let verticalDifference = left.bounds.topLeft.y - right.bounds.topLeft.y
            if abs(verticalDifference) > 0.02 { return verticalDifference < 0 }
            return left.bounds.topLeft.x < right.bounds.topLeft.x
        }

        var seen = Set<String>()
        return ordered.compactMap { item in
            let line = item.transcript
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            guard !line.isEmpty, line.count <= 220, seen.insert(line).inserted else {
                return nil
            }
            return line
        }.prefix(80).map { $0 }
    }

    private func normalizedQRPayloads(from items: [RecognizedItem]) -> [String] {
        var seen = Set<String>()
        return items.compactMap { item -> String? in
            guard case .barcode(let barcode) = item,
                  let value = barcode.payloadStringValue?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                  !value.isEmpty,
                  value.count <= 8_000,
                  seen.insert(value).inserted else {
                return nil
            }
            return value
        }.prefix(10).map { $0 }
    }

    private func finish(_ result: Result<BusinessCardScannerResult, Error>?, dismiss: Bool = true) {
        guard !didFinish else { return }
        didFinish = true
        cancelAutoConfirm()
        if scanner.isScanning {
            scanner.stopScanning()
        }
        scanner.delegate = nil
        if dismiss, scanner.presentingViewController != nil {
            scanner.dismiss(animated: true) { [completion] in completion(result) }
        } else {
            completion(result)
        }
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didAdd addedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        update(items: allItems)
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didUpdate updatedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        update(items: allItems)
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didRemove removedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        update(items: allItems)
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
    ) {
        finish(.failure(BusinessCardScannerError.scanningFailed(error)))
    }
}
