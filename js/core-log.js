  window.Flock = window.Flock || {};
var bsPid = null, bsName = null, bsResult = '', bsAction = 'None', bsSaving = false, bsSource = 'general';

  function openBsheet(pid, name, source) {
    bsPid = pid; bsName = name; bsResult = ''; bsAction = 'None'; bsSaving = false;
    bsSource = source || 'general';
    document.getElementById('bsheet-av').textContent = ini(name);
    document.getElementById('bsheet-name').textContent = name;
    document.getElementById('bsheet-sub').textContent = 'Logging call for ' + name;
    document.getElementById('bs-summary').value = '';
    document.getElementById('bs-next-dt').value = '';
    document.getElementById('bs-dateWrap').style.display = 'none';
    document.getElementById('bs-msg').className = 'msg';
    document.getElementById('bs-msg').textContent = '';
    document.getElementById('bsheet-save-btn').disabled = false;
    // reset chips/actions
    document.querySelectorAll('#bsheet .chip').forEach(function(c) { c.className = 'chip'; });
    document.querySelectorAll('#bsheet .ac').forEach(function(c) { c.className = 'ac'; });
    var noneBtn = document.querySelector('#bsheet [data-a="None"]');
    if (noneBtn) noneBtn.className = 'ac a-none a-sel';
    document.getElementById('bsheet-backdrop').classList.add('open');
    var sheet = document.getElementById('bsheet');
    sheet.style.transform = '';
    sheet.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeBsheet() {
    document.getElementById('bsheet-backdrop').classList.remove('open');
    var sheet = document.getElementById('bsheet');
    sheet.classList.remove('open');
    sheet.style.transform = '';
    document.body.style.overflow = '';
    stopVoice();
  }

  function bsPick(btn, type) {
    if (type === 'r') {
      document.querySelectorAll('#bsheet .chip').forEach(function(c) { c.className = 'chip'; });
      var r = btn.getAttribute('data-r');
      var cls = r === 'Reached' ? 'c-reached' : r === 'No Answer' ? 'c-noanswer' : r === 'Left Message' ? 'c-message' : 'c-resched';
      btn.className = 'chip ' + cls;
      bsResult = r;
    } else {
      document.querySelectorAll('#bsheet .ac').forEach(function(c) { c.className = 'ac'; });
      var a = btn.getAttribute('data-a');
      btn.className = 'ac a-sel';
      bsAction = a;
      document.getElementById('bs-dateWrap').style.display = (a === 'Callback' || a === 'Follow-up') ? 'block' : 'none';
    }
  }

  function bsShowMsg(text, cls) {
    var el = document.getElementById('bs-msg');
    el.textContent = text; el.className = 'msg ' + cls;
  }

  function optimisticRemoveFromDash(pid) {
    if (!pid) return;
    var row = document.querySelector('.person-row[data-pid="' + String(pid).replace(/"/g, '\\"') + '"]');
    if (!row) return;

    var section = row.closest('.section');
    var isCb = row.classList.contains('row-cb');
    var isOv = row.classList.contains('row-ov');
    var isTd = row.classList.contains('row-td');
    row.remove();

    if (section) {
      var badge = section.querySelector('.sec-badge');
      if (badge) {
        var n = parseInt(badge.textContent, 10);
        if (!isNaN(n) && n > 0) badge.textContent = String(n - 1);
      }
      if (!section.querySelector('.person-row') && !section.querySelector('.empty-row')) {
        section.insertAdjacentHTML('beforeend', '<div class="empty-row">None - all clear here</div>');
      }
    }

    function decText(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var n = parseInt(el.textContent, 10);
      if (!isNaN(n) && n > 0) el.textContent = String(n - 1);
    }
    if (isCb) { decText('sn-cb'); decText('h-cb'); }
    if (isOv) { decText('sn-ov'); decText('h-ov'); }
    if (isTd) { decText('sn-td'); decText('h-td'); }
  }

  function saveBsheet() {
    if (bsSaving) return;
    if (!bsPid) { bsShowMsg('No person selected.', 'error'); return; }
    if (!bsResult) { bsShowMsg('Please choose a result.', 'error'); return; }
    var summary = document.getElementById('bs-summary').value.trim();
    var aiAssist = inferAssistFromText(summary);
    var ndt = document.getElementById('bs-next-dt').value;
    if (bsAction === 'None' && aiAssist.nextAction !== 'None') {
      bsAction = aiAssist.nextAction;
      var inferredBtn = document.querySelector('#bsheet [data-a="' + bsAction + '"]');
      if (inferredBtn) bsPick(inferredBtn, 'a');
    }
    if (!ndt && aiAssist.nextActionDateTime && (bsAction === 'Callback' || bsAction === 'Follow-up')) {
      try { ndt = dtLocalValue(new Date(aiAssist.nextActionDateTime)); } catch(e) { ndt = ''; }
      if (ndt) document.getElementById('bs-next-dt').value = ndt;
    }
    if ((bsAction === 'Callback' || bsAction === 'Follow-up') && !ndt) {
      bsShowMsg('Please set a date for ' + bsAction + '.', 'error'); return;
    }
    var payload = {
      personId: bsPid,
      fullName: bsName,
      result: bsResult,
      nextAction: bsAction,
      summary: summary,
      nextActionDateTime: ndt || null,
      channel: bsSource === 'who_to_call' ? 'Who to Call' : 'Call'
    };
    bsSaving = true;
    document.getElementById('bsheet-save-btn').disabled = true;
    bsShowMsg('Saving...', 'info');
    stopVoice();

    var savePromise;
    if (!navigator.onLine) {
      queueOfflineCall(payload);
      savePromise = Promise.resolve({ success: true, offline: true });
    } else {
      savePromise = apiPost('saveInteraction', { payload: payload });
    }
    savePromise.then(function(res) {
      bsSaving = false;
      if (res && res.success) {
        hapticTick_();
        _homeQuickStatsCache = null;
        var quickTodos = aiAssist.todos || [];
        if (quickTodos.length && res.interactionId) {
          apiPost('saveTodos', { payload: {
            interactionId: res.interactionId,
            personId: bsPid,
            personName: bsName,
            todos: quickTodos.map(function(t){ return { text: t }; })
          } }).then(function(){ if (window.loadTodos && document.getElementById('pg-todos') && document.getElementById('pg-todos').classList.contains('active')) loadTodos(); }).catch(function(e){ console.warn('[Flock]', e); });
        }
        var todoNote = quickTodos.length ? ' ' + quickTodos.length + ' action item' + (quickTodos.length > 1 ? 's' : '') + ' added.' : '';
        bsShowMsg((res.offline ? 'Saved offline - will sync when back online.' : 'Call logged!') + todoNote, 'success');
        if (bsResult === 'Reached' && bsAction === 'None') optimisticRemoveFromDash(bsPid);
        (window.runPostSaveRefresh ? runPostSaveRefresh() : Promise.resolve())
          .finally(function() {
            setTimeout(function() { closeBsheet(); loadDash(); }, 260);
          });
      } else {
        document.getElementById('bsheet-save-btn').disabled = false;
        bsShowMsg('Save failed: ' + (res && res.error ? res.error : 'Unknown error.'), 'error');
      }
    }).catch(function(e) {
      bsSaving = false;
      document.getElementById('bsheet-save-btn').disabled = false;
      bsShowMsg('Error: ' + String(e), 'error');
    });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VOICE TO TEXT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var _recognition = null;
  var _activeTextareaId = null;
  var _activeMicBtnId = null;
  var _voiceErrorShownAt = 0;
  var _voiceKeepAlive = false;
  var _voiceManualStop = false;
  var _voiceRestartCount = 0;

  function voiceHint(msg) {
    var now = Date.now();
    if (now - _voiceErrorShownAt < 1200) return;
    _voiceErrorShownAt = now;
    if (window.showUxToast) window.showUxToast(msg);
  }

  function toggleVoice(textareaId, micBtnId, isRestart) {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isSafariIOS = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/i.test(ua);
    var hasSpeechApi = ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
    var insecureContext = (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1');
    if (insecureContext) {
      voiceHint('Voice input works best on HTTPS. Trying anyway.');
    }
    if (!hasSpeechApi) {
      var btn = document.getElementById(micBtnId);
      if (btn) btn.classList.add('no-support');
      var fallbackTa = document.getElementById(textareaId);
      if (fallbackTa) { try { fallbackTa.focus({ preventScroll: true }); } catch(e) { try { fallbackTa.focus(); } catch(_) {} } }
      if (isIOS && !isSafariIOS) voiceHint('Voice input may be limited here. Open in Safari or use the keyboard mic.');
      else voiceHint('Voice input is not supported in this browser. Use Safari on iPhone or your keyboard mic.');
      return;
    }
    if (isIOS && !isSafariIOS) {
      voiceHint('Trying voice input. If it fails on iPhone, open this page in Safari.');
    }
    if (_recognition && _activeTextareaId === textareaId) {
      stopVoice(); return;
    }
    stopVoice();
    _activeTextareaId = textareaId;
    _activeMicBtnId = micBtnId;
    _voiceManualStop = false;
    _voiceKeepAlive = !!isIOS;
    if (!isRestart) _voiceRestartCount = 0;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _recognition = new SpeechRecognition();
    _recognition.continuous = !isIOS;
    _recognition.interimResults = !isIOS;
    _recognition.lang = 'en-US';
    _recognition.maxAlternatives = 1;
    var finalTranscript = '';
    var ta = document.getElementById(textareaId);
    if (!ta) { stopVoice(); return; }
    // On mobile Safari/WebViews, focusing the target first improves start reliability.
    try { ta.focus({ preventScroll: true }); } catch(e) { try { ta.focus(); } catch(_) {} }
    var startVal = ta.value;
    if (startVal && !startVal.endsWith(' ')) startVal += ' ';
    _recognition.onstart = function() {
      _voiceRestartCount = 0;
      var btn = document.getElementById(micBtnId);
      if (btn) btn.classList.add('listening');
    };
    _recognition.onresult = function(e) {
      _voiceRestartCount = 0;
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      var ta2 = document.getElementById(textareaId);
      if (ta2) ta2.value = startVal + finalTranscript + interim;
    };
    _recognition.onerror = function(e) {
      _voiceKeepAlive = false;
      stopVoice();
      if (e && e.error === 'not-allowed') voiceHint('Microphone permission denied.');
      else if (e && e.error === 'service-not-allowed') voiceHint('Speech service is blocked on this browser. Try Safari.');
      else if (e && e.error === 'audio-capture') voiceHint('No microphone found or mic access is unavailable.');
      else if (e && e.error === 'no-speech') voiceHint('No speech detected. Try again.');
      else voiceHint('Voice input unavailable right now.');
    };
    _recognition.onend = function() {
      var btn = document.getElementById(_activeMicBtnId);
      if (btn) btn.classList.remove('listening');
      var shouldRestart = _voiceKeepAlive && !_voiceManualStop && _activeTextareaId === textareaId;
      _recognition = null;
      if (shouldRestart) {
        _voiceRestartCount += 1;
        if (_voiceRestartCount > 3) {
          _voiceKeepAlive = false;
          voiceHint('Voice input stopped. Continue with keyboard input.');
          return;
        }
        setTimeout(function() {
          if (_voiceKeepAlive && !_voiceManualStop && _activeTextareaId === textareaId && !_recognition) {
            toggleVoice(textareaId, micBtnId, true);
          }
        }, 140);
      }
    };
    function startRecognition(allowRetry) {
      try {
        _recognition.start();
      } catch (e) {
        if (allowRetry && isIOS) {
          setTimeout(function() {
            try { if (_recognition) _recognition.start(); }
            catch (_) { stopVoice(); voiceHint('Could not start voice input. Try again and allow microphone access.'); }
          }, 140);
        } else {
          stopVoice();
          voiceHint('Could not start voice input. Try again and allow microphone access.');
        }
      }
    }
    startRecognition(true);
  }

  function stopVoice() {
    _voiceManualStop = true;
    _voiceKeepAlive = false;
    if (_recognition) {
      try { _recognition.stop(); } catch(e) {}
      _recognition = null;
    }
    if (_activeMicBtnId) {
      var btn = document.getElementById(_activeMicBtnId);
      if (btn) btn.classList.remove('listening');
    }
    _activeTextareaId = null;
    _activeMicBtnId = null;
    _voiceRestartCount = 0;
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // OFFLINE QUEUE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var _offlineQueue = [];
  var _syncing = false;
  var _offlineFailedById = {};

  (function initOfflineQueue() {
    try {
      var stored = localStorage.getItem('ct-offline-queue');
      if (stored) _offlineQueue = JSON.parse(stored) || [];
    } catch(e) { _offlineQueue = []; }
    updateOfflineBadge();

    window.addEventListener('online',  function() { updateOfflineBanner(); syncOfflineQueue(); });
    window.addEventListener('offline', function() { updateOfflineBanner(); });
    updateOfflineBanner();
  })();

  function updateOfflineBanner() {
    var banner = document.getElementById('offline-banner');
    if (!banner) return;
    var isOff = !navigator.onLine;
    banner.classList.toggle('on', isOff);
    if (isOff) {
      var qlen = _offlineQueue.length;
      var failed = Object.keys(_offlineFailedById).length;
      var txt = '';
      if (qlen > 0) txt += qlen + ' queued';
      if (failed > 0) txt += (txt ? ', ' : '') + failed + ' unsynced';
      document.getElementById('offline-q-count').textContent = txt ? '(' + txt + ')' : '';
    }
  }

  function updateOfflineBadge() {
    var failed = Object.keys(_offlineFailedById).length;
    window.__offlineUnsyncedCount = failed;
    document.querySelectorAll('.offline-queue-badge').forEach(function(el) {
      el.textContent = _offlineQueue.length;
      el.classList.toggle('on', _offlineQueue.length > 0);
      el.title = failed > 0 ? (failed + ' item' + (failed === 1 ? '' : 's') + ' failed to sync') : '';
    });
    updateOfflineBanner();
  }

  function queueOfflineCall(payload) {
    payload._queuedAt = new Date().toISOString();
    _offlineQueue.push(payload);
    try { localStorage.setItem('ct-offline-queue', JSON.stringify(_offlineQueue)); } catch(e) {}
    updateOfflineBadge();
  }

  function syncOfflineQueue() {
    if (_syncing || _offlineQueue.length === 0 || !navigator.onLine) return;
    _syncing = true;
    var queue = _offlineQueue.slice();
    var syncedKeys = {};
    var failedCount = 0;
    var idx = 0;
    function next() {
      if (idx >= queue.length) {
        _syncing = false;
        var remaining = _offlineQueue.filter(function(item) {
          return !syncedKeys[item._queuedAt];
        });
        _offlineQueue = remaining;
        try { localStorage.setItem('ct-offline-queue', JSON.stringify(_offlineQueue)); } catch(e) {}
        updateOfflineBadge();
        if (failedCount > 0 && window.showUxToast) {
          window.showUxToast(failedCount + ' offline item' + (failedCount === 1 ? '' : 's') + ' still unsynced');
        }
        if (idx > 0) {
          (window.runPostSaveRefresh ? runPostSaveRefresh() : Promise.resolve())
            .finally(function() { loadDash(); });
        }
        return;
      }
      var queued = queue[idx];
      var payload = Object.assign({}, queued);
      var queuedTodos = Array.isArray(queued._queuedTodos) ? queued._queuedTodos : [];
      delete payload._queuedAt;
      delete payload._queuedTodos;
      apiPost('saveInteraction', { payload: payload })
        .then(function(res) {
          if (!queuedTodos.length) {
            syncedKeys[queued._queuedAt] = true;
            delete _offlineFailedById[queued._queuedAt];
            idx++;
            next();
            return;
          }
          var interactionId = (res && (res.interactionId || res.interactionID || res.id)) || ('offline-' + Date.now());
          apiPost('saveTodos', { payload: {
            interactionId: interactionId,
            personId: payload.personId,
            personName: payload.fullName || '',
            todos: queuedTodos.map(function(t){
              if (t && typeof t === 'object') {
                return { text: String(t.text || ''), dueDate: String(t.dueDate || '') };
              }
              return { text: String(t || ''), dueDate: '' };
            }).filter(function(t){ return String(t.text || '').trim(); })
          } }).then(function(){
            syncedKeys[queued._queuedAt] = true;
            delete _offlineFailedById[queued._queuedAt];
            idx++;
            next();
          }).catch(function(e){
            console.warn('[Flock]', e);
            failedCount++;
            _offlineFailedById[queued._queuedAt] = String(e);
            idx++;
            next();
          });
        })
        .catch(function(e) {
          console.warn('[Flock]', e);
          failedCount++;
          _offlineFailedById[queued._queuedAt] = String(e);
          idx++;
          next();
        });
    }
    next();
  }

  // saveCall with offline mode support
  function saveCall() {
    if (!navigator.onLine) {
      // gather form values same way as saveCall
      var pid  = document.getElementById('person-id').value;
      var ndt  = document.getElementById('next-dt').value;
      var sum  = document.getElementById('summary').value.trim();
      if (!pid)      { showMsg('Please select a person.', 'error'); return; }
      if (!selResult){ showMsg('Please choose a result.', 'error'); return; }
      if ((selAction === 'Callback' || selAction === 'Follow-up') && !ndt) {
        showMsg('Please set a date.', 'error'); return;
      }
      var p    = allPeople.find(function(x){ return String(x.id) === String(pid); });
      var name = p ? p.name : (document.getElementById('sel-name').textContent || pid);
      var payload = { personId:pid, fullName:name, result:selResult, nextAction:selAction, summary:sum, nextActionDateTime:ndt||null };
      if (window.flushPendingLogTodoItem) window.flushPendingLogTodoItem();
      var todoItems = (window.getTodoItems ? window.getTodoItems() : []);
      if (todoItems.length) payload._queuedTodos = todoItems;
      queueOfflineCall(payload);
      hapticTick_();
      var sig = JSON.stringify(payload); lastSig = sig; lastAt = Date.now();
      document.getElementById('log-form').style.display = 'none';
      document.getElementById('success-sub').textContent = 'Saved offline - will sync when reconnected.' + (todoItems.length ? ' ' + todoItems.length + ' action item' + (todoItems.length > 1 ? 's' : '') + ' queued.' : '');
      document.getElementById('success-screen').classList.add('on');
      document.getElementById('save-bar').style.display = 'none';
      return;
    }
    _origSaveCall();
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PERSON NOTES
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

