// ============================================================================
// stockflow-device.js — auto device detection (phone / tablet / foldable / desktop)
// ----------------------------------------------------------------------------
// Sets data-device, data-orientation and (when applicable) data-foldable on the
// <html> element so CSS can adjust, exposes window.sfDevice, and dispatches a
// "sf:devicechange" event on change. Re-evaluates on rotate / fold / resize.
//
// Detection prefers robust media features (viewport segments, pointer/hover,
// touch points) over brittle UA sniffing; UA is only a hint for foldables that
// don't yet report the Viewport Segments API. Loaded in <head> so attributes
// are set before the body paints (the responsive CSS already covers the common
// width cases, so there is no layout flash).
// ============================================================================
(function () {
  'use strict';

  function mm(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }

  var ua = navigator.userAgent || '';
  // Known foldables that may not (yet) expose the Viewport Segments API.
  var UA_FOLDABLE = /\bSM-F\d{3}|Galaxy Z (?:Fold|Flip)|Pixel Fold|Surface ?Duo|\bFold\d?\b/i.test(ua);
  // iPadOS 13+ masquerades as desktop Safari — catch it via touch points.
  var IPAD_AS_MAC = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;

  var touchCapable = (navigator.maxTouchPoints || 0) > 1 || mm('(pointer: coarse)') || ('ontouchstart' in window);
  var finePointer  = mm('(pointer: fine)') && mm('(hover: hover)');

  function detect() {
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var dualH = mm('(horizontal-viewport-segments: 2)'); // side-by-side panels
    var dualV = mm('(vertical-viewport-segments: 2)');   // stacked panels (book posture)
    var foldable = dualH || dualV || UA_FOLDABLE;

    var type;
    if (foldable && vw >= 600) {
      type = 'foldable';                                 // unfolded — large canvas
    } else if (!touchCapable && finePointer && vw >= 1024) {
      type = 'desktop';                                  // mouse + keyboard
    } else if (vw >= 1280) {
      type = 'desktop';                                  // very wide regardless of input
    } else if (vw >= 768 || IPAD_AS_MAC) {
      type = 'tablet';
    } else {
      type = 'phone';                                    // the default, tested layout
    }

    return {
      type: type,
      orientation: vw >= vh ? 'landscape' : 'portrait',
      foldable: !!foldable,
      touch: !!touchCapable,
      width: vw,
      height: vh
    };
  }

  function apply() {
    var d = detect();
    var html = document.documentElement;
    var changed = html.getAttribute('data-device') !== d.type ||
                  html.getAttribute('data-orientation') !== d.orientation;
    html.setAttribute('data-device', d.type);
    html.setAttribute('data-orientation', d.orientation);
    if (d.foldable) html.setAttribute('data-foldable', '1');
    else html.removeAttribute('data-foldable');
    window.sfDevice = d;
    if (changed) {
      try { window.dispatchEvent(new CustomEvent('sf:devicechange', { detail: d })); } catch (e) {}
    }
    return d;
  }

  apply();

  // Re-evaluate on anything that can change the viewport: rotation, folding,
  // window resize, or the visual viewport shifting (keyboard, segment changes).
  var debounce;
  function onResize() { clearTimeout(debounce); debounce = setTimeout(apply, 120); }
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize, { passive: true });
  }

  window.sfDetectDevice = apply; // allow manual re-detection if needed
})();
