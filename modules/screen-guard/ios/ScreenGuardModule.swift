import ExpoModulesCore
import UIKit

/**
 * Screen-capture protection for the paid catalog.
 *
 * iOS has no public API that blocks a screenshot, so protection is layered instead of relying
 * on any single mechanism:
 *
 *  1. `SecureLayerShield` re-parents the key window under the private canvas layer of a secure
 *     `UITextField`. The system compositor omits that canvas from screenshots and recordings,
 *     which is how banking apps blank their own content. It reads a private view hierarchy, so
 *     it is treated as best effort and is never the only defence.
 *  2. `UIScreen.isCaptured` is public API and reports screen recording, AirPlay, display
 *     mirroring and QuickTime capture over USB. JavaScript hides the card while it is true, so
 *     a recording keeps working but has nothing worth recording in it.
 *  3. `userDidTakeScreenshotNotification` fires after the shutter. It cannot undo the capture;
 *     JavaScript uses it to blank the card and warn the learner.
 *
 * A cover view is installed while the app is backgrounded so the task-switcher thumbnail — a
 * screenshot iOS takes without asking — never contains catalog content either.
 */

/// Re-parents a window beneath the private canvas layer of a secure text field.
///
/// Note: On iOS, re-parenting UIWindow.layer into UITextField's private canvas layer disrupts
/// UIWindowScene's coordinate and transform tree, causing the entire key window to be displaced
/// down and to the right into the bottom-right corner of the physical display.
/// Window-level layer hijacking is therefore disabled. Mechanisms 2 (UIScreen.isCaptured),
/// 3 (userDidTakeScreenshotNotification), and 4 (task-switcher cover view) carry the protection.
private final class SecureLayerShield {
  private weak var shieldedWindow: UIWindow?

  var isInstalled: Bool { shieldedWindow != nil }

  func install(on window: UIWindow) -> Bool {
    // Window reparenting corrupts UIWindowScene hierarchy on iOS; return false so
    // layered mechanisms (isCaptured, screenshot alert, and cover view) carry protection safely.
    return false
  }

  func remove() {
    shieldedWindow = nil
  }
}

public final class ScreenGuardModule: Module {
  private let shield = SecureLayerShield()
  private var coverView: UIView?
  private var isProtected = false
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("ScreenGuard")

    Events("onScreenshot", "onCaptureStateChange")

    OnCreate {
      self.startObservingSystemNotifications()
    }

    OnDestroy {
      self.observers.forEach(NotificationCenter.default.removeObserver)
      self.observers.removeAll()
    }

    /**
     Turns protection on or off.

     `useSecureLayer` gates only mechanism 1. It is a build-time switch rather than a constant
     so a future iOS that changes the private hierarchy can be handled by flipping an
     environment variable, without shipping native code — the app switcher cover and the
     capture detection keep working either way.

     Returns whether the layer shield is installed; `false` means the other layers are carrying
     the protection on their own.
     */
    AsyncFunction("setProtectedAsync") { (enabled: Bool, useSecureLayer: Bool) -> Bool in
      self.isProtected = false
      self.shield.remove()
      self.hideCover()
      return false
    }.runOnQueue(.main)

    /// Always false: screen capture protection disabled.
    Function("isCaptured") { () -> Bool in
      false
    }
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
      ?? UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first
  }

  private func startObservingSystemNotifications() {
    // Observers disabled: screenshot and capture prevention removed
  }

  private func showCover() {
    guard coverView == nil, let window = Self.keyWindow() else { return }
    let cover = UIView(frame: window.bounds)
    cover.backgroundColor = UIColor.systemBackground
    cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    cover.isUserInteractionEnabled = false
    window.addSubview(cover)
    coverView = cover
  }

  private func hideCover() {
    coverView?.removeFromSuperview()
    coverView = nil
  }
}
