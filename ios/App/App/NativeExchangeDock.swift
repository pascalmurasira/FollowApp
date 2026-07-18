import SwiftUI
import UIKit

enum NativeExchangeDockAction: String {
    case scan
    case myQR = "my-qr"
}

enum NativeExchangeDockFactory {
    @MainActor
    static func make(
        onAction: @escaping (NativeExchangeDockAction) -> Void
    ) -> UIViewController {
        let view = NativeExchangeDock(onAction: onAction)
        let controller = UIHostingController(rootView: view)
        controller.view.backgroundColor = .clear
        controller.modalPresentationStyle = .pageSheet
        controller.preferredContentSize = CGSize(width: 430, height: 270)

        if let sheet = controller.sheetPresentationController {
            sheet.detents = [.medium()]
            sheet.prefersGrabberVisible = true
            sheet.preferredCornerRadius = 30
            sheet.prefersScrollingExpandsWhenScrolledToEdge = false
        }
        return controller
    }
}

private struct NativeExchangeDock: View {
    let onAction: (NativeExchangeDockAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Exchange details")
                    .font(.title2.weight(.bold))
                Text("Capture their card or let them scan yours.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if #available(iOS 26.0, *) {
                LiquidGlassExchangeButtons(onAction: onAction)
            } else {
                LegacyExchangeButtons(onAction: onAction)
            }

            Label("Private by default · You approve before saving", systemImage: "checkmark.shield")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(uiColor: .systemBackground))
    }
}

@available(iOS 26.0, *)
private struct LiquidGlassExchangeButtons: View {
    let onAction: (NativeExchangeDockAction) -> Void

    var body: some View {
        GlassEffectContainer(spacing: 12) {
            HStack(spacing: 12) {
                Button {
                    onAction(.scan)
                } label: {
                    Label("Scan card", systemImage: "person.crop.rectangle")
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.glassProminent)
                .accessibilityHint("Opens the live business-card scanner")

                Button {
                    onAction(.myQR)
                } label: {
                    Label("My QR", systemImage: "qrcode")
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.glass)
                .accessibilityHint("Shows your digital card for another person to scan")
            }
        }
    }
}

private struct LegacyExchangeButtons: View {
    let onAction: (NativeExchangeDockAction) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button {
                onAction(.scan)
            } label: {
                Label("Scan card", systemImage: "person.crop.rectangle")
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 20 / 255, green: 45 / 255, blue: 76 / 255))

            Button {
                onAction(.myQR)
            } label: {
                Label("My QR", systemImage: "qrcode")
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.bordered)
            .tint(Color(red: 20 / 255, green: 45 / 255, blue: 76 / 255))
        }
    }
}
