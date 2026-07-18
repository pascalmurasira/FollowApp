import ExtensionKit
import Foundation
import LockedCameraCapture
import SwiftUI

@main
struct FollowAppCaptureExtension: LockedCameraCaptureExtension {
    var body: some LockedCameraCaptureExtensionScene {
        LockedCameraCaptureUIScene { session in
            FollowAppCaptureViewfinder(session: session)
                .ignoresSafeArea()
        }
    }
}
