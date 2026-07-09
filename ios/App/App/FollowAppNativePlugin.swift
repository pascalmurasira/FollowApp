import Capacitor
import UIKit
import AVFoundation

@objc(FollowAppNativePlugin)
public class FollowAppNativePlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "FollowAppNativePlugin"
    public let jsName = "FollowAppNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeBusinessCardPhoto", returnType: CAPPluginReturnPromise)
    ]

    private var photoCall: CAPPluginCall?

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

    @objc func takeBusinessCardPhoto(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.presentCamera(call)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    DispatchQueue.main.async {
                        if granted {
                            self.presentCamera(call)
                        } else {
                            call.reject("Camera permission denied.", "PERMISSION_DENIED")
                        }
                    }
                }
            case .denied, .restricted:
                call.reject("Camera permission denied.", "PERMISSION_DENIED")
            @unknown default:
                call.reject("Camera permission is unavailable.", "CAMERA_UNAVAILABLE")
            }
        }
    }

    private func presentCamera(_ call: CAPPluginCall) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            call.reject("Camera is unavailable on this device.", "CAMERA_UNAVAILABLE")
            return
        }

        guard let viewController = bridge?.viewController else {
            call.reject("Camera could not be opened.", "CAMERA_UNAVAILABLE")
            return
        }

        if photoCall != nil {
            call.reject("Camera is already open.", "CAMERA_BUSY")
            return
        }

        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        if UIImagePickerController.isCameraDeviceAvailable(.rear) {
            picker.cameraDevice = .rear
        }
        picker.allowsEditing = false
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen

        photoCall = call
        viewController.present(picker, animated: true)
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = photoCall
        photoCall = nil
        picker.dismiss(animated: true) {
            call?.reject("User cancelled camera.", "USER_CANCELLED")
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let call = photoCall
        photoCall = nil

        guard let image = info[.originalImage] as? UIImage,
              let dataUrl = image.businessCardDataUrl() else {
            picker.dismiss(animated: true) {
                call?.reject("Photo could not be read.", "PHOTO_UNREADABLE")
            }
            return
        }

        picker.dismiss(animated: true) {
            call?.resolve(["dataUrl": dataUrl])
        }
    }
}

private extension UIImage {
    func businessCardDataUrl(maxPixel: CGFloat = 1600, compressionQuality: CGFloat = 0.82) -> String? {
        let image = normalizedOrientation()
        let longestSide = max(image.size.width, image.size.height)
        let scale = longestSide > maxPixel ? maxPixel / longestSide : 1
        let targetSize = CGSize(
            width: image.size.width * scale,
            height: image.size.height * scale
        )

        let rendered: UIImage
        if scale < 1 {
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            rendered = UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: targetSize))
            }
        } else {
            rendered = image
        }

        guard let jpeg = rendered.jpegData(compressionQuality: compressionQuality) else {
            return nil
        }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }

    func normalizedOrientation() -> UIImage {
        guard imageOrientation != .up else { return self }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
