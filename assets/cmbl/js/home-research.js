(() => {
  const viewport = document.getElementById('home-research-topics');
  const track = viewport?.querySelector('.topic-track');
  if (!track) return;
  const section = viewport.closest('.home-research');
  const controls = section.querySelector('.topic-controls');
  const buttons = [...controls.querySelectorAll('button')];
  const originals = [...track.children];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SPEED = 14; // CSS pixels per second: a 280px card travels in about 20 seconds.
  let cycleWidth = 0;
  let position = 0;
  let lastWritten = 0;
  let lastTime = 0;
  let inView = true;
  let hovered = false;
  let touching = false;
  let focused = false;
  let animation = 0;
  let clones = [];
  let manualMove = null;

  const hasCardFocus = () => originals.some(card => card.contains(document.activeElement));
  const wrapped = value => cycleWidth + ((value - cycleWidth) % cycleWidth + cycleWidth) % cycleWidth;
  const stepSize = () => originals[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 0);
  const writePosition = value => {
    position = value;
    viewport.scrollLeft = value;
    lastWritten = viewport.scrollLeft;
  };
  const updateControls = () => {
    controls.hidden = viewport.scrollWidth <= viewport.clientWidth + 2;
    const bounded = reducedMotion.matches;
    buttons[0].disabled = bounded && viewport.scrollLeft <= 2;
    buttons[1].disabled = bounded && viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2;
  };
  const makeClones = () => originals.map(original => {
    const clone = original.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.dataset.topicClone = '';
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    clone.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach(node => node.setAttribute('tabindex', '-1'));
    // Mouse activation keeps the ordinary destination, without focusing an aria-hidden link.
    clone.addEventListener('mousedown', event => event.preventDefault());
    return clone;
  });
  const reset = () => {
    cancelAnimationFrame(animation);
    manualMove = null;
    lastTime = 0;
    clones.forEach(clone => clone.remove());
    clones = [];
    viewport.classList.toggle('is-looping', !reducedMotion.matches);
    if (reducedMotion.matches) {
      writePosition(0);
      updateControls();
      return;
    }
    const before = makeClones();
    const after = makeClones();
    track.prepend(...before);
    track.append(...after);
    clones = [...before, ...after];
    cycleWidth = stepSize() * originals.length;
    writePosition(cycleWidth);
    updateControls();
    animation = requestAnimationFrame(frame);
  };
  const frame = now => {
    const elapsed = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    if (manualMove) {
      const progress = Math.min((now - manualMove.start) / 420, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      writePosition(wrapped(manualMove.from + manualMove.distance * eased));
      if (progress === 1) manualMove = null;
    } else if (!document.hidden && inView && !hovered && !touching && !focused) {
      writePosition(wrapped(position + SPEED * elapsed));
    }
    animation = requestAnimationFrame(frame);
  };
  buttons.forEach(button => button.addEventListener('click', () => {
    const distance = Number(button.dataset.topicDirection) * stepSize();
    if (reducedMotion.matches) {
      viewport.scrollBy({ left: distance, behavior: 'instant' });
      updateControls();
    } else {
      manualMove = { from: viewport.scrollLeft, distance, start: performance.now() };
    }
  }));
  viewport.addEventListener('scroll', () => {
    if (Math.abs(viewport.scrollLeft - lastWritten) > 1) {
      position = viewport.scrollLeft;
      if (!manualMove && !reducedMotion.matches && !hasCardFocus()) {
        writePosition(wrapped(position));
      }
    }
    updateControls();
  }, { passive: true });
  viewport.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') hovered = true; });
  viewport.addEventListener('pointerleave', () => { hovered = false; });
  viewport.addEventListener('pointerdown', () => { touching = true; manualMove = null; });
  window.addEventListener('pointerup', () => { touching = false; });
  window.addEventListener('pointercancel', () => { touching = false; });
  section.addEventListener('focusin', () => { focused = true; });
  section.addEventListener('focusout', () => {
    requestAnimationFrame(() => { focused = section.contains(document.activeElement); });
  });
  new ResizeObserver(() => {
    if (reducedMotion.matches) return updateControls();
    const previousCycle = cycleWidth;
    cycleWidth = stepSize() * originals.length;
    if (previousCycle && cycleWidth) writePosition(wrapped(position / previousCycle * cycleWidth));
    updateControls();
  }).observe(viewport);
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; }, { rootMargin: '80px' }).observe(viewport);
  reducedMotion.addEventListener('change', reset);
  document.addEventListener('visibilitychange', () => { lastTime = 0; });
  reset();
})();
