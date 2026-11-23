const KEYBOARD_MIN_HEIGHT = 120;
const FIELD_GAP = 12;

export function enhanceScoreKeyboard(root: HTMLElement) {
  const fields = Array.from(root.querySelectorAll<HTMLInputElement>('[data-score-field]'));
  // A calculator may keep a second input mode in a hidden panel: only the visible fields take part.
  const visibleFields = () => fields.filter((input) => !input.closest('[hidden]'));
  const results = root.querySelector<HTMLElement>('#score-results-heading');
  const warning = root.querySelector<HTMLElement>('[data-score-warn]');
  const resultsButton = root.querySelector<HTMLButtonElement>('[data-score-results-button]');
  const keyboard = root.querySelector<HTMLElement>('[data-score-keyboard]');
  const currentField = root.querySelector<HTMLElement>('[data-score-current-field]');
  const nextField = root.querySelector<HTMLButtonElement>('[data-score-next-field]');
  if (!fields.length || !results || !resultsButton || !keyboard || !currentField || !nextField) return;

  const viewport = window.visualViewport;
  const touch = window.matchMedia('(any-pointer: coarse)');
  const header = document.querySelector<HTMLElement>('.site-header');
  let activeField: HTMLInputElement | undefined;
  let resultScrollTimer = 0;
  let resultDestination: HTMLElement;

  function isKeyboardOpen() {
    // Browser chrome or pinch zoom alone must not show the keyboard toolbar.
    return Boolean(touch.matches && viewport && viewport.scale === 1
      && window.innerHeight - viewport.height >= KEYBOARD_MIN_HEIGHT);
  }

  function updateKeyboard(revealField = false) {
    if (!keyboard || !currentField || !nextField) return;
    const field = fields.find((input) => input === document.activeElement);
    // Keep the toolbar usable if focus arrives on its button from an assistive technology.
    activeField = field ?? (keyboard.contains(document.activeElement) ? activeField : undefined);
    keyboard.hidden = !activeField || !isKeyboardOpen();
    if (keyboard.hidden || !viewport || !activeField) return;

    keyboard.style.setProperty('--score-keyboard-bottom', `${viewport.offsetTop + viewport.height}px`);
    currentField.textContent = activeField.dataset.scoreField ?? '';
    nextField.textContent = activeField === visibleFields().at(-1) ? 'Sonucu gör' : 'Sonraki alan';

    if (revealField && field) {
      const toolbar = keyboard.getBoundingClientRect();
      const visibleTop = toolbar.bottom - viewport.height;
      const fieldBox = (field.closest('.score-field') ?? field).getBoundingClientRect();
      const top = Math.max(visibleTop, header?.getBoundingClientRect().bottom ?? visibleTop) + FIELD_GAP;
      const bottom = toolbar.top - FIELD_GAP;
      const box = fieldBox.height <= bottom - top ? fieldBox : field.getBoundingClientRect();
      const delta = box.top < top
        ? box.top - top
        : Math.max(0, box.bottom - bottom);
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
    }
  }

  function scrollToResult() {
    window.clearTimeout(resultScrollTimer);
    resultScrollTimer = 0;
    if (document.activeElement === resultDestination) {
      resultDestination.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }

  function showResults() {
    if (!results) return;
    resultDestination = warning && !warning.hidden ? warning : results;
    resultDestination.focus({ preventScroll: true });
    // iOS restores the layout after dismissing its keyboard. Reveal the result once it settles.
    if (isKeyboardOpen()) {
      window.clearTimeout(resultScrollTimer);
      resultScrollTimer = window.setTimeout(scrollToResult, 450);
    } else {
      scrollToResult();
    }
    updateKeyboard();
  }

  function advance(field: HTMLInputElement) {
    const visible = visibleFields();
    const next = visible[visible.indexOf(field) + 1];
    if (!next) {
      showResults();
      return;
    }
    next.focus({ preventScroll: true });
    if (!isKeyboardOpen()) next.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  fields.forEach((field) => field.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.repeat
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    advance(field);
  }));

  resultsButton.addEventListener('click', showResults);
  resultsButton.hidden = false;
  // Prevent focus leaving the input while allowing WebKit's synthesized click.
  nextField.addEventListener('mousedown', (event) => event.preventDefault());
  nextField.addEventListener('click', () => { if (activeField) advance(activeField); });

  root.addEventListener('focusin', () => requestAnimationFrame(() => updateKeyboard(true)));
  root.addEventListener('focusout', () => requestAnimationFrame(() => updateKeyboard()));
  viewport?.addEventListener('resize', () => {
    updateKeyboard(true);
    if (resultScrollTimer && !isKeyboardOpen()) scrollToResult();
  });
  viewport?.addEventListener('scroll', () => updateKeyboard());
}
