import Capacitor
import UIKit
import AVFoundation
import Contacts
import ContactsUI

@objc(FollowAppNativePlugin)
public class FollowAppNativePlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate, CNContactViewControllerDelegate {
    public let identifier = "FollowAppNativePlugin"
    public let jsName = "FollowAppNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareBusinessCardCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cameraStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeBusinessCardPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveContact", returnType: CAPPluginReturnPromise)
    ]

    private var photoCall: CAPPluginCall?
    private var contactCall: CAPPluginCall?
    private var preparedCameraPicker: UIImagePickerController?
    private let contactStore = CNContactStore()

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
                            self.preparedCameraPicker = nil
                            call.reject("Camera permission denied.", "PERMISSION_DENIED")
                        }
                    }
                }
            case .denied, .restricted:
                self.preparedCameraPicker = nil
                call.reject("Camera permission denied.", "PERMISSION_DENIED")
            @unknown default:
                self.preparedCameraPicker = nil
                call.reject("Camera permission is unavailable.", "CAMERA_PERMISSION_UNAVAILABLE")
            }
        }
    }

    @objc func prepareBusinessCardCamera(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Prewarming must never request permission, configure a camera
            // source, or present UI. Only an already-authorized app gets an
            // unconfigured picker shell; the user's later tap remains the
            // sole camera trigger.
            guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
                  UIImagePickerController.isSourceTypeAvailable(.camera),
                  self.photoCall == nil else {
                call.resolve(["prepared": false])
                return
            }

            self.prepareCameraPickerIfSafe()
            call.resolve(["prepared": self.preparedCameraPicker != nil])
        }
    }

    @objc func cameraStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let permission: String
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                permission = "granted"
            case .notDetermined:
                permission = "prompt"
            case .denied:
                permission = "denied"
            case .restricted:
                permission = "restricted"
            @unknown default:
                permission = "unknown"
            }

            call.resolve([
                "available": UIImagePickerController.isSourceTypeAvailable(.camera),
                "permission": permission
            ])
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

    private func presentCamera(_ call: CAPPluginCall) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            preparedCameraPicker = nil
            call.reject("Camera is unavailable on this device.", "CAMERA_HARDWARE_UNAVAILABLE")
            return
        }

        guard let viewController = bridge?.viewController,
              let presenter = topViewController(from: viewController) else {
            call.reject("Camera could not be opened.", "CAMERA_PRESENTATION_FAILED")
            return
        }

        if photoCall != nil {
            call.reject("Camera is already open.", "CAMERA_BUSY")
            return
        }

        guard presenter.viewIfLoaded?.window != nil,
              !presenter.isBeingDismissed else {
            call.reject("Camera could not be opened.", "CAMERA_PRESENTATION_FAILED")
            return
        }

        let wasPrewarmed = preparedCameraPicker != nil
        let picker = preparedCameraPicker ?? UIImagePickerController()
        preparedCameraPicker = nil
        configureCameraPicker(picker)
        let presentationStartedAt = ProcessInfo.processInfo.systemUptime
        photoCall = call
        presenter.present(picker, animated: false) {
            let elapsedMilliseconds = Int(
                (ProcessInfo.processInfo.systemUptime - presentationStartedAt) * 1_000
            )
            NSLog(
                "[FollowApp] Camera controller presented in %d ms (prewarmed: %@).",
                elapsedMilliseconds,
                wasPrewarmed ? "yes" : "no"
            )
        }
        // UIKit can decline a presentation without invoking a useful error
        // callback (for example while another controller is transitioning).
        // Never leave the JavaScript promise — and its Opening camera state —
        // pending forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self, weak picker] in
            guard let self,
                  self.photoCall === call,
                  picker?.presentingViewController == nil else {
                return
            }
            self.photoCall = nil
            call.reject("Camera could not be opened.", "CAMERA_PRESENTATION_FAILED")
        }
    }

    private func configureCameraPicker(_ picker: UIImagePickerController) {
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        if UIImagePickerController.isCameraDeviceAvailable(.rear) {
            picker.cameraDevice = .rear
        }
        picker.allowsEditing = false
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
    }

    private func prepareCameraPickerIfSafe() {
        guard preparedCameraPicker == nil,
              photoCall == nil,
              AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
              UIImagePickerController.isSourceTypeAvailable(.camera) else {
            return
        }

        // Do not set `sourceType`, access `view`, or call `loadViewIfNeeded()`
        // here. The shell stays disconnected from camera hardware until the
        // user explicitly asks to scan.
        preparedCameraPicker = UIImagePickerController()
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

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = photoCall
        photoCall = nil
        picker.dismiss(animated: true) { [weak self] in
            self?.prepareCameraPickerIfSafe()
            call?.reject("User cancelled camera.", "USER_CANCELLED")
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let call = photoCall
        photoCall = nil

        guard let image = info[.originalImage] as? UIImage else {
            picker.dismiss(animated: true) { [weak self] in
                self?.prepareCameraPickerIfSafe()
                call?.reject("Photo could not be read.", "PHOTO_UNREADABLE")
            }
            return
        }

        // Give the camera back immediately. Resize/JPEG/base64 work is sizable
        // on modern photos and should not freeze the picker on the main thread.
        picker.dismiss(animated: true) { [weak self] in
            self?.prepareCameraPickerIfSafe()
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let dataUrl = image.businessCardDataUrl()
            DispatchQueue.main.async {
                if let dataUrl {
                    call?.resolve(["dataUrl": dataUrl])
                } else {
                    call?.reject("Photo could not be read.", "PHOTO_UNREADABLE")
                }
            }
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
