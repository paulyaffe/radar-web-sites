(function () {
  'use strict';
  const link = document.getElementById('privacy-options');
  if (!link) return;
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  window.googlefc.callbackQueue.push({
    CONSENT_API_READY: function () {
      if (typeof window.__tcfapi !== 'function') return;
      window.__tcfapi('addEventListener', 0, function (data, success) {
        link.hidden = !(success && data && data.gdprApplies &&
          typeof window.googlefc.showRevocationMessage === 'function');
      });
    }
  });
  link.addEventListener('click', function (event) {
    event.preventDefault();
    window.googlefc.callbackQueue.push({
      CONSENT_API_READY: function () {
        if (typeof window.googlefc.showRevocationMessage === 'function') {
          window.googlefc.showRevocationMessage();
        }
      }
    });
  });
})();
