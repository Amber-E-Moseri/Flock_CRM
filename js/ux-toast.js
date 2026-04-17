
(function(){
  function todayKey(){ return new Date().toISOString().slice(0,10); }

  function showToast(msg){
    var el = $('ux-toast'); if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(window.__uxToastTimer);
    window.__uxToastTimer = setTimeout(function(){ el.classList.remove('on'); }, 2200);
  }
  window.showUxToast = showToast;

  // Session bump so the counter updates immediately after a save,
  // then a live fetch from the sheet confirms the real number.
  if (!window.__todayLoggedCount) window.__todayLoggedCount = 0;

  function updateDailyProgress(count){
    var n = (count !== undefined) ? count : (window.__todayLoggedCount || 0);
    var dc = $('dash-today-count');
    if (dc) {
      dc.textContent = n + ' call' + (n === 1 ? '' : 's') + ' logged today';
      dc.style.color = '#2f7a4c';
      dc.style.fontStyle = 'italic';
      dc.style.opacity = '0.9';
      dc.style.display = 'block';
    }
  }

  function fetchAndUpdateDailyProgress(){
    if (typeof window.refreshTodayCount === 'function') {
      window.refreshTodayCount().then(function(res){
        var n = (res && res.count != null) ? res.count : (window.__todayLoggedCount || 0);
        window.__todayLoggedCount = n;
        updateDailyProgress(n);
      }).catch(function(){ updateDailyProgress(); });
      return;
    }
    updateDailyProgress();
  }

  var _oldRenderDash = window.renderDash;
  window.renderDash = function(data){
    if (_oldRenderDash) _oldRenderDash(data);
    updateDailyProgress();
  };

  function successScreenVisible(){ return $('success-screen') && $('success-screen').classList.contains('on'); }
  function aiSuccessVisible(){ return $('ai-step-success') && $('ai-step-success').style.display !== 'none'; }

  var _oldSaveCall = window.saveCall;
  window.saveCall = function(){
    var offline = !navigator.onLine;
    var ret = _oldSaveCall ? _oldSaveCall() : null;
    setTimeout(function(){
      if (successScreenVisible()) {
        window.__todayLoggedCount = (window.__todayLoggedCount || 0) + 1;
        updateDailyProgress();
        setTimeout(function(){
          if (window.runPostSaveRefresh) window.runPostSaveRefresh().catch(function(e){ console.warn('[Flock]', e); });
          else fetchAndUpdateDailyProgress();
        }, 120);
        if (offline) showToast('Saved locally - will sync when you reconnect');
        else showToast('Call logged');
      }
    }, 140);
    return ret;
  };

  var _oldConfirmAiLog = window.confirmAiLog;
  window.confirmAiLog = function(){
    var offline = !navigator.onLine;
    var ret = _oldConfirmAiLog ? _oldConfirmAiLog() : null;
    setTimeout(function(){
      if (aiSuccessVisible()) {
        window.__todayLoggedCount = (window.__todayLoggedCount || 0) + 1;
        updateDailyProgress();
        setTimeout(function(){
          if (window.runPostSaveRefresh) window.runPostSaveRefresh().catch(function(e){ console.warn('[Flock]', e); });
          else fetchAndUpdateDailyProgress();
        }, 120);
        if (offline) showToast('Saved locally - will sync when you reconnect');
        else showToast('Call logged');
      }
    }, 180);
    return ret;
  };

  var _oldSaveBsheet = window.saveBsheet;
  window.saveBsheet = function(){
    var offline = !navigator.onLine;
    var ret = _oldSaveBsheet ? _oldSaveBsheet() : null;
    setTimeout(function(){
      var msg = $('bs-msg') ? $('bs-msg').textContent : '';
      if (/saved/i.test(msg)) {
        window.__todayLoggedCount = (window.__todayLoggedCount || 0) + 1;
        updateDailyProgress();
        setTimeout(function(){
          if (window.runPostSaveRefresh) window.runPostSaveRefresh().catch(function(e){ console.warn('[Flock]', e); });
          else fetchAndUpdateDailyProgress();
        }, 120);
        if (offline) showToast('Saved locally - will sync when you reconnect');
        else showToast('Call logged');
      }
    }, 180);
    return ret;
  };

  // Cache latest dashboard data
  var _origLoadDash = window.loadDash;
  window.loadDash = function(){
    if (!_origLoadDash) return;
    var originalRender = window.renderDash;
    window.renderDash = function(data){ window.__lastDashData = data; originalRender(data); window.renderDash = originalRender; };
    return _origLoadDash();
  };

  // Notification toggle feedback
  var _oldToggleDailySummary = window.toggleDailySummary;
  window.toggleDailySummary = function(on){
    if (_oldToggleDailySummary) _oldToggleDailySummary(on);
    setTimeout(function(){
      showToast(on ? 'Notifications enabled - you’ll get one daily summary' : 'Notifications turned off');
    }, 180);
  };

  // Better offline queue sync feedback
  if (typeof window.syncOfflineQueue === 'function') {
    var _oldSyncOfflineQueue = window.syncOfflineQueue;
    window.syncOfflineQueue = function(){
      var hadQueued = Array.isArray(window._offlineQueue) && window._offlineQueue.length > 0;
      var res = _oldSyncOfflineQueue();
      if (hadQueued) {
        showToast('Syncing offline saves…');
        setTimeout(function(){
          if (Array.isArray(window._offlineQueue) && window._offlineQueue.length === 0) showToast('Synced ✓');
        }, 1200);
      }
      return res;
    };
  }

  // Back navigation consistency: close sheets first
  function anySheetOpen(){
    return ($('bsheet-backdrop') && $('bsheet-backdrop').classList.contains('open')) ||
           ($('ai-backdrop') && $('ai-backdrop').classList.contains('open')) ||
           ($('edit-modal-backdrop') && $('edit-modal-backdrop').classList.contains('open')) ||
           ($('notes-modal-backdrop') && $('notes-modal-backdrop').classList.contains('open'));
  }
  function closeTopSheet(){
    if ($('ai-backdrop') && $('ai-backdrop').classList.contains('open') && window.closeAiAssist) { closeAiAssist(); return true; }
    if ($('bsheet-backdrop') && $('bsheet-backdrop').classList.contains('open') && window.closeBsheet) { closeBsheet(); return true; }
    if ($('edit-modal-backdrop') && $('edit-modal-backdrop').classList.contains('open') && window.closeEditModal) { closeEditModal(); return true; }
    if ($('notes-modal-backdrop') && $('notes-modal-backdrop').classList.contains('open') && window.closeNotesModal) { closeNotesModal(); return true; }
    return false;
  }
  window.addEventListener('hashchange', function(e){
    if (anySheetOpen()) {
      closeTopSheet();
      if (e && e.preventDefault) e.preventDefault();
    }
  });
  window.addEventListener('popstate', function(){
    if (anySheetOpen()) closeTopSheet();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeTopSheet(); });

  document.addEventListener('DOMContentLoaded', function(){ resetDailyCountIfNeeded(); });
})();
