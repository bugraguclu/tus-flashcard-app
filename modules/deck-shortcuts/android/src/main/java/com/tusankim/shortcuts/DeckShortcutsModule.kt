package com.tusankim.shortcuts

import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DeckShortcutsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeckShortcuts")

    AsyncFunction("requestDeckShortcutAsync") Coroutine { shortcutId: String, title: String, url: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

      withContext(Dispatchers.Default) {
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
          return@withContext mapOf("status" to "unsupported")
        }

        val launchIntent = context.packageManager
          .getLaunchIntentForPackage(context.packageName)
          ?.apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(url)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
          }
          ?: Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          }

        val shortcut = ShortcutInfoCompat.Builder(context, "deck-$shortcutId")
          .setShortLabel(title.take(40))
          .setLongLabel(title.take(80))
          .setIcon(IconCompat.createWithResource(context, context.applicationInfo.icon))
          .setIntent(launchIntent)
          .build()

        val requested = ShortcutManagerCompat.requestPinShortcut(context, shortcut, null)
        mapOf("status" to if (requested) "requested" else "unsupported")
      }
    }
  }
}
