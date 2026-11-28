/** Keep native focus trapping and the backdrop alive until a dialog has finished leaving. */
export function dialogMotion(dialog: HTMLDialogElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let closingTimer: number | undefined;
  let outsidePointer: number | undefined;

  function reset() {
    window.clearTimeout(closingTimer);
    closingTimer = undefined;
    outsidePointer = undefined;
  }

  function finishClose() {
    reset();
    if (dialog.open) dialog.close();
  }

  function close(immediate = false) {
    if (!dialog.open) return;
    if (immediate || reduced.matches) {
      finishClose();
      return;
    }
    if (dialog.dataset.dialogState === 'closing') return;
    dialog.dataset.dialogState = 'closing';
    // CSS owns the duration. A timer also covers closing before entry has painted,
    // or a browser suppressing transitionend when its tab goes into the background.
    const value = getComputedStyle(dialog).getPropertyValue('--dialog-exit-duration').trim();
    const duration = Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
    if (!Number.isFinite(duration) || !duration) finishClose();
    else closingTimer = window.setTimeout(finishClose, duration + 32);
  }

  function open() {
    if (dialog.open) {
      if (dialog.dataset.dialogState !== 'closing') return false;
      reset();
      dialog.dataset.dialogState = 'open';
      return true;
    }
    if (document.querySelector('dialog[open]')) return false;
    reset();
    dialog.dataset.dialogState = 'entering';
    dialog.showModal();
    // Resolve the closed pose while the native dialog is in the top layer. Switching
    // poses then transitions in Safari too, without discrete display/overlay CSS.
    dialog.getBoundingClientRect();
    dialog.dataset.dialogState = 'open';
    return true;
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    // A queued native close event must not reset a dialog that has already reopened.
    if (dialog.open) return;
    reset();
    delete dialog.dataset.dialogState;
  });
  dialog.addEventListener('transitionend', (event) => {
    if (event.target === dialog && event.propertyName === 'opacity' && dialog.dataset.dialogState === 'closing') finishClose();
  });

  const outside = (event: PointerEvent) => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', (event) => {
    outsidePointer = event.isPrimary && outside(event) ? event.pointerId : undefined;
  });
  dialog.addEventListener('pointerup', (event) => {
    if (outsidePointer === event.pointerId && outside(event)) close();
    outsidePointer = undefined;
  });
  dialog.addEventListener('pointercancel', () => { outsidePointer = undefined; });
  reduced.addEventListener('change', (event) => {
    if (event.matches && dialog.dataset.dialogState === 'closing') finishClose();
  });

  return { open, close };
}
