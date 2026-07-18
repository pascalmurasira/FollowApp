import LockedCameraCapture
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// UIImagePickerController deliberately backs this lock-screen experience: it
/// uses AVCaptureEventInteraction, including the hardware Camera Control, and
/// therefore meets LockedCameraCapture's active-camera lifecycle requirement.
struct FollowAppCaptureViewfinder: UIViewControllerRepresentable {
    let session: LockedCameraCaptureSession

    func makeCoordinator() -> Coordinator {
        Coordinator(session: session)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.image.identifier]
        picker.cameraCaptureMode = .photo
        picker.cameraDevice = .rear
        picker.allowsEditing = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let session: LockedCameraCaptureSession
        private var isHandingOff = false

        init(session: LockedCameraCaptureSession) {
            self.session = session
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            guard !isHandingOff,
                  let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.84),
                  data.count <= 30_000_000 else {
                return
            }
            isHandingOff = true

            let fileName = "business-card-\(UUID().uuidString).jpg"
            let destination = session.sessionContentURL.appendingPathComponent(fileName)
            do {
                try data.write(to: destination, options: [.atomic])
            } catch {
                isHandingOff = false
                return
            }

            let activity = NSUserActivity(activityType: NSUserActivityTypeLockedCameraCapture)
            activity.title = "Scan business card"
            activity.userInfo = ["route": "scan", "filename": fileName]

            Task { @MainActor [session] in
                do {
                    try await session.openApplication(for: activity)
                } catch {
                    self.isHandingOff = false
                }
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            // The system owns dismissal for a locked capture scene. Keep the
            // live viewfinder available rather than trying to dismiss it.
        }
    }
}
