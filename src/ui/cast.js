// Google Cast sender. The TV runs Birdsongs itself (receiver.html), loaded
// from the web, so nothing is mirrored and this page can be closed: while
// connected it's just a remote. Works in Chrome/Edge on desktop and Android.
import { CAST_APP_ID, CAST_NAMESPACE } from '../config.js';

const SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

// hooks: { getState(), onConnect(deviceName, resumed), onDisconnect(), onStatus(msg) }
export function setupCast(wrap, hooks) {
  const api = { connected: false, send: () => {} };
  if (!CAST_APP_ID) return api;

  window.__onGCastApiAvailable = (available) => {
    if (!available || !window.cast?.framework) return;
    const { CastContext, CastContextEventType, SessionState, CastState } = window.cast.framework;
    const ctx = CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: CAST_APP_ID,
      // reopen the page later and it rejoins whatever is playing on the TV
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    // only show the button when there's something to cast to
    const showFor = (state) => {
      wrap.hidden = state === CastState.NO_DEVICES_AVAILABLE;
    };
    showFor(ctx.getCastState());
    ctx.addEventListener(CastContextEventType.CAST_STATE_CHANGED, (e) => showFor(e.castState));

    let session = null;
    const onMessage = (ns, raw) => {
      try {
        hooks.onStatus?.(typeof raw === 'string' ? JSON.parse(raw) : raw);
      } catch {
        // ignore malformed messages
      }
    };
    api.send = (msg) => {
      session?.sendMessage(CAST_NAMESPACE, msg).catch(() => {});
    };
    ctx.addEventListener(CastContextEventType.SESSION_STATE_CHANGED, (e) => {
      if (e.sessionState === SessionState.SESSION_STARTED || e.sessionState === SessionState.SESSION_RESUMED) {
        session = ctx.getCurrentSession();
        session.addMessageListener(CAST_NAMESPACE, onMessage);
        api.connected = true;
        const resumed = e.sessionState === SessionState.SESSION_RESUMED;
        // a fresh cast takes this page's moment; a rejoin just asks the TV what it's doing
        api.send(resumed ? { type: 'hello' } : { type: 'state', ...hooks.getState() });
        hooks.onConnect?.(session.getCastDevice()?.friendlyName || 'your TV', resumed);
      } else if (e.sessionState === SessionState.SESSION_ENDED) {
        session = null;
        api.connected = false;
        hooks.onDisconnect?.();
      }
    });
  };

  const s = document.createElement('script');
  s.src = SDK;
  s.async = true;
  document.head.appendChild(s);
  return api;
}
