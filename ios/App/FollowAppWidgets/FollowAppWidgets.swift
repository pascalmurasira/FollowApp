import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private enum FollowAppWidgetURL {
    static let scan = URL(string: "followapp://scan")!
    static let myQR = URL(string: "followapp://my-qr")!
    static let event = URL(string: "followapp://event")!
}

@main
struct FollowAppWidgetBundle: WidgetBundle {
    var body: some Widget {
        FollowAppScanControl()
        FollowAppQRControl()
        FollowAppEventLiveActivity()
    }
}

struct FollowAppScanControl: ControlWidget {
    static let kind = "com.pascalmurasira.followapp.control.scan"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: FollowAppCameraCaptureIntent()) {
                Label("Scan card", systemImage: "person.crop.rectangle")
            }
        }
        .displayName("Scan a card")
        .description("Capture a business card directly from the Lock Screen, Control Center or Action button.")
    }
}

struct FollowAppQRControl: ControlWidget {
    static let kind = "com.pascalmurasira.followapp.control.my-qr"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenURLIntent(FollowAppWidgetURL.myQR)) {
                Label("My QR", systemImage: "qrcode")
            }
        }
        .displayName("Show my QR")
        .description("Open your digital card for someone nearby to scan.")
    }
}

struct FollowAppEventLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FollowAppEventAttributes.self) { context in
            EventLockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.96, green: 0.97, blue: 0.99))
                .activitySystemActionForegroundColor(Color(red: 0.08, green: 0.18, blue: 0.30))
                .widgetURL(FollowAppWidgetURL.event)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.capturedCount)", systemImage: "person.crop.rectangle.stack")
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Label("\(context.state.promiseCount)", systemImage: "checkmark.circle")
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.eventName)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 24) {
                        Link(destination: FollowAppWidgetURL.scan) {
                            Label("Scan", systemImage: "camera.viewfinder")
                        }
                        Link(destination: FollowAppWidgetURL.myQR) {
                            Label("My QR", systemImage: "qrcode")
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                }
            } compactLeading: {
                Image(systemName: "person.crop.rectangle.stack")
            } compactTrailing: {
                Text("\(context.state.capturedCount)")
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "person.crop.rectangle.stack")
            }
            .widgetURL(FollowAppWidgetURL.event)
            .keylineTint(Color(red: 0.08, green: 0.18, blue: 0.30))
        }
    }
}

private struct EventLockScreenView: View {
    let context: ActivityViewContext<FollowAppEventAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.eventName)
                        .font(.headline)
                        .lineLimit(1)
                    Text("Conference memory mode")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "sparkles")
                    .foregroundStyle(Color(red: 0.08, green: 0.18, blue: 0.30))
            }

            HStack(spacing: 20) {
                Metric(value: context.state.capturedCount, label: "captured")
                Metric(value: context.state.promiseCount, label: "promises")
                Spacer()
                Link(destination: FollowAppWidgetURL.scan) {
                    Image(systemName: "camera.viewfinder")
                        .font(.title3.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .background(Color(red: 0.08, green: 0.18, blue: 0.30), in: Circle())
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Scan a card")
                Link(destination: FollowAppWidgetURL.myQR) {
                    Image(systemName: "qrcode")
                        .font(.title3.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .background(.white.opacity(0.8), in: Circle())
                        .foregroundStyle(Color(red: 0.08, green: 0.18, blue: 0.30))
                }
                .accessibilityLabel("Show my QR")
            }
        }
        .padding()
    }
}

private struct Metric: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("\(value)")
                .font(.title2.weight(.bold))
                .monospacedDigit()
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
