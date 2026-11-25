// Theme initialization & stale asset recovery (loaded as external script so CSP can forbid script-src 'unsafe-inline')
(function () {
  var resolvedDark = false;
  var defaultPresetId = 'espresso-cream-blue';
  try {
    var raw = localStorage.getItem('al-zahra-appearance-storage');
    if (raw) {
      var parsed = JSON.parse(raw);
      var st = parsed && parsed.state ? parsed.state : null;
      var ver = typeof parsed.version === 'number' ? parsed.version : 0;
      var storedPreset = st && typeof st.activePresetId === 'string' ? st.activePresetId : '';
      var shouldUpgradeDefault =
        ver < 5 &&
        (!storedPreset || storedPreset === 'obsidian-pro' || storedPreset === 'optiparts-or');
      document.documentElement.setAttribute(
        'data-preset',
        shouldUpgradeDefault ? defaultPresetId : storedPreset || defaultPresetId
      );
      var mode = st && st.mode ? st.mode : 'light';
      if (mode === 'dark') {
        resolvedDark = true;
      } else if (mode === 'light') {
        resolvedDark = false;
      } else {
        resolvedDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } else {
      document.documentElement.setAttribute('data-preset', defaultPresetId);
      resolvedDark = localStorage.getItem('theme') === 'dark';
    }
  } catch (_e) {
    document.documentElement.setAttribute('data-preset', defaultPresetId);
    resolvedDark =
      localStorage.getItem('theme') === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  if (resolvedDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  // Purge any legacy plaintext customer PII caches left in localStorage from older builds
  try {
    var keysToPurge = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('alzahra_party_cache_') === 0) {
        keysToPurge.push(k);
      }
    }
    for (var j = 0; j < keysToPurge.length; j++) {
      localStorage.removeItem(keysToPurge[j]);
    }
  } catch (_e2) {
    // ignore storage access errors
  }

  // Auto-recover from stale deployment chunks or stylesheets
  window.addEventListener(
    'error',
    function (e) {
      var target = e.target;
      if (target && (target.tagName === 'LINK' || target.tagName === 'SCRIPT')) {
        var key = 'alzahra_asset_reload_timestamp';
        var lastReload = Number(sessionStorage.getItem(key)) || 0;
        var now = Date.now();
        if (now - lastReload > 10000) {
          sessionStorage.setItem(key, String(now));
          window.location.reload();
        }
      }
    },
    true
  );
})();
