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
private final class SecureLayerShield {
  private let field = UITextField()
  private weak var shieldedWindow: UIWindow?
  private weak var originalSuperlayer: CALayer?

  var isInstalled: Bool { shieldedWindow != nil }

  func install(on window: UIWindow) -> Bool {
    guard !isInstalled else { return true }

    field.isSecureTextEntry = true
    field.isUserInteractionEnabled = false
    field.backgroundColor = .clear
    field.translatesAutoresizingMaskIntoConstraints = false
    window.addSubview(field)
    NSLayoutConstraint.activate([
      field.centerXAnchor.constraint(equalTo: window.centerXAnchor),
      field.centerYAnchor.constraint(equalTo: window.centerYAnchor),
    ])

    // The canvas is created by UIKit only once the field is in a hierarchy and secure.
    guard let canvas = field.layer.sublayers?.last, let superlayer = window.layer.superlayer else {
      field.removeFromSuperview()
      return false
    }

    originalSuperlayer = superlayer
    superlayer.addSublayer(field.layer)
    canvas.addSublayer(window.layer)
    shieldedWindow = window
    return true
  }

  func remove() {
    guard let window = shieldedWindow else { return }
    // Put the window layer back where UIKit expects it before detaching the shield, otherwise
    // the app renders to a layer that is no longer in the tree and the screen goes black.
    originalSuperlayer?.addSublayer(window.layer)
    field.layer.removeFromSuperlayer()
    field.removeFromSuperview()
    shieldedWindow = nil
    originalSuperlayer = nil
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
      self.isProtected = enabled
      guard let window = Self.keyWindow() else { return false }
      if enabled {
        return useSecureLayer ? self.shield.install(on: window) : false
      }
      self.shield.remove()
      self.hideCover()
      return true
    }.runOnQueue(.main)

    /// True while the display is being recorded, mirrored or captured over USB.
    Function("isCaptured") { () -> Bool in
      Self.keyWindow()?.screen.isCaptured ?? UIScreen.main.isCaptured
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
    let center = NotificationCenter.default
    let main = OperationQueue.main

    observers.append(center.addObserver(
      forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: main
    ) { [weak self] _ in
      guard let self, self.isProtected else { return }
      self.sendEvent("onScreenshot", [:])
    })

    observers.append(center.addObserver(
      forName: UIScreen.capturedDidChangeNotification, object: nil, queue: main
    ) { [weak self] _ in
      guard let self else { return }
      self.sendEvent("onCaptureStateChange", ["isCaptured": UIScreen.main.isCaptured])
    })

    // The task-switcher snapshot is taken between these two notifications.
    observers.append(center.addObserver(
      forName: UIApplication.willResignActiveNotification, object: nil, queue: main
    ) { [weak self] _ in
      guard let self, self.isProtected else { return }
      self.showCover()
    })

    observers.append(center.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: main
    ) { [weak self] _ in
      self?.hideCover()
    })
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
