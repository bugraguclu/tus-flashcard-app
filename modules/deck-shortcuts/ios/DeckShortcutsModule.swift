import ExpoModulesCore
import Intents
import IntentsUI
import UIKit

private let deckShortcutActivityType = "com.tusankim.deck-shortcut"
private let deckShortcutURLKey = "deckURL"

private final class DeckShortcutPresentationDelegate: NSObject,
  INUIAddVoiceShortcutViewControllerDelegate,
  UIAdaptivePresentationControllerDelegate {
  private let completion: (String) -> Void
  private var didComplete = false

  init(completion: @escaping (String) -> Void) {
    self.completion = completion
  }

  private func finish(_ status: String) {
    guard !didComplete else { return }
    didComplete = true
    completion(status)
  }

  func addVoiceShortcutViewController(
    _ controller: INUIAddVoiceShortcutViewController,
    didFinishWith voiceShortcut: INVoiceShortcut?,
    error: Error?
  ) {
    controller.dismiss(animated: true) {
      self.finish(error == nil && voiceShortcut != nil ? "created" : "unsupported")
    }
  }

  func addVoiceShortcutViewControllerDidCancel(_ controller: INUIAddVoiceShortcutViewController) {
    controller.dismiss(animated: true) {
      self.finish("cancelled")
    }
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish("cancelled")
  }
}

public final class DeckShortcutsModule: Module {
  private var presentationDelegate: DeckShortcutPresentationDelegate?

  public func definition() -> ModuleDefinition {
    Name("DeckShortcuts")

    AsyncFunction("requestDeckShortcutAsync") {
      (shortcutId: String, title: String, url: String, promise: Promise) in
      guard presentationDelegate == nil,
            URL(string: url) != nil,
            let presenter = appContext?.utilities?.currentViewController() else {
        promise.resolve(["status": "unavailable"])
        return
      }

      let activity = NSUserActivity(activityType: deckShortcutActivityType)
      activity.title = title
      activity.userInfo = [deckShortcutURLKey: url]
      activity.requiredUserInfoKeys = Set([deckShortcutURLKey])
      activity.isEligibleForPrediction = true
      activity.persistentIdentifier = "com.tusankim.deck.\(shortcutId)"
      activity.suggestedInvocationPhrase = title
      activity.becomeCurrent()

      let shortcut = INShortcut(userActivity: activity)
      let controller = INUIAddVoiceShortcutViewController(shortcut: shortcut)
      controller.modalPresentationStyle = .formSheet

      let delegate = DeckShortcutPresentationDelegate { [weak self] status in
        self?.presentationDelegate = nil
        promise.resolve(["status": status])
      }
      presentationDelegate = delegate
      controller.delegate = delegate
      presenter.present(controller, animated: true) {
        // UIKit creates the presentation controller during `present`. Installing this delegate
        // before that call returns leaves pull-down dismissal without a completion callback.
        controller.presentationController?.delegate = delegate
      }
    }
    .runOnQueue(.main)
  }
}

public final class DeckShortcutAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == deckShortcutActivityType,
          let urlString = userActivity.userInfo?[deckShortcutURLKey] as? String,
          let url = URL(string: urlString) else {
      return false
    }

    application.open(url, options: [:], completionHandler: nil)
    return true
  }
}
