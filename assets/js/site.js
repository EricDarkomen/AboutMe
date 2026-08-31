/* Three small jobs, no dependencies: the theme toggle, the duty-board clock,
   and the scroll reveal. Everything degrades to a perfectly readable page with
   this file missing, which is the whole reason none of it is load-bearing. */
'use strict';

(function () {
  var root = document.documentElement;

  /* ---- theme ----------------------------------------------------------
     Three states, not two: an explicit choice stamps the root, and the
     default (nothing stamped) follows the operating system. localStorage is
     wrapped because a browser set to block site data throws on the read. */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  var saved = store.get('theme');
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);

  var btn = document.getElementById('theme');
  if (btn) {
    btn.addEventListener('click', function () {
      var dark = root.getAttribute('data-theme') === 'dark' ||
                 (!root.hasAttribute('data-theme') &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store.set('theme', next);
      btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light' : 'Switch to dark');
    });
  }

  /* ---- the clock ------------------------------------------------------
     Plymouth time rather than the reader's, because the board is saying when
     it is where I am — which is the useful half if you are calling me. */
  var clock = document.getElementById('clock');
  if (clock) {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch (e) { fmt = null; }

    var tick = function () {
      var now = new Date();
      clock.textContent = (fmt ? fmt.format(now) : '--:--') + ' GMT';
    };
    tick();
    setInterval(tick, 15000);
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---- reveal ---------------------------------------------------------
     Opt-in: the class is added by script, so a reader with no JavaScript
     never meets an element stuck at opacity 0. */
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var targets = [].slice.call(document.querySelectorAll('.masthead .rise'));

  if (motion.matches || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('in'); });
    return;
  }

  /* The masthead is above the fold and reveals on load; nothing below it
     hides, because a CV that fades in as you scroll is a CV somebody has to
     wait for. */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      targets.forEach(function (el) { el.classList.add('in'); });
    });
  });
})();
