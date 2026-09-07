package com.tusankim.screenguard

import android.view.WindowManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Screen-capture protection for the paid catalog.
 *
 * Android needs only one mechanism: FLAG_SECURE makes the window refuse screenshots, come out
 * black in screen recordings and cast sessions, and show a blank thumbnail in the recents list.
 * The capture-state and screenshot events the iOS module emits have no Android equivalent and
 * no Android need, so the JavaScript side treats them as optional.
 */
class ScreenGuardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenGuard")

    Events("onScreenshot", "onCaptureStateChange")

    // `useSecureLayer` exists for the iOS half of this module; FLAG_SECURE has no such caveat.
    AsyncFunction("setProtectedAsync") { enabled: Boolean, useSecureLayer: Boolean ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      activity.runOnUiThread {
        if (enabled) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
      }
      true
    }

    // FLAG_SECURE already blanks every capture route, so nothing has to be hidden reactively.
    Function("isCaptured") { false }
  }
}
