import Capacitor
import UIKit

@objc(FollowAppNativePlugin)
public class FollowAppNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FollowAppNativePlugin"
    public let jsName = "FollowAppNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

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
}
