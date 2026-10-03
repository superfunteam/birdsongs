// "Install" (Chrome/Edge/Android prompt, or Add to Home Screen steps on iOS)
// and "share" (native share sheet, or copy the link).

export function isStandalone() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true
  );
}

export function setupInstall(button, { flash, toast }) {
  if (isStandalone()) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
    flash('installed ♪');
  });
  if (ios) button.hidden = false;
  button.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') button.hidden = true;
    } else if (ios) {
      toast('add to home screen', 'tap Share, then “Add to Home Screen”', 'it opens full screen, like an app');
    }
  });
}

export function setupShare(button, { flash, link }) {
  button.addEventListener('click', async () => {
    const { url, text } = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Birdsongs', text, url });
      } catch {
        // dismissed
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('link copied');
    } catch {
      flash(url);
    }
  });
}
