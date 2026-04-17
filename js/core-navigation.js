  window.Flock = window.Flock || {};
  function goLogPerson(pid, name) {
    preselPid = pid;
    preselName = name;
    showPage('pg-log');
  }

  function initLogPage() {
    resetLogForm();
    if (!peopleLoaded && !peopleLoading) fetchPeople();
    if (preselPid && peopleLoaded) {
      var match = allPeople.find(function(p){ return String(p.id) === String(preselPid); });
      if (match) applyPersonSelection(match);
      else applyPersonSelection({ id: preselPid, name: preselName || preselPid });
      preselPid = null;
      preselName = null;
    }
  }

  function showDropLoading() {
    var drop = document.getElementById('search-drop');
    drop.innerHTML = '<div class="people-loading"><span>Loading contacts</span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    drop.classList.add('open');
  }

  function fetchPeople() {
    if (peopleLoading && peoplePromise) return peoplePromise;
    peopleLoading = true;
    showDropLoading();
    peoplePromise = getPeople().then(function(list){
      allPeople = Array.isArray(list) ? list : [];
      peopleLoaded = true;
      peopleLoading = false;
      if (preselPid) {
        var match = allPeople.find(function(p){ return String(p.id) === String(preselPid); });
        if (match) applyPersonSelection(match);
        else applyPersonSelection({ id: preselPid, name: preselName || preselPid });
        preselPid = null;
        preselName = null;
      }
      if (document.getElementById('search-drop').classList.contains('open')) refreshDropdown();
      return allPeople;
    }).catch(function(e){
      peopleLoading = false;
      showMsg('Could not load contacts: ' + String(e), 'error');
      document.getElementById('search-drop').innerHTML = '<div class="no-results">Could not load contacts</div>';
      document.getElementById('search-drop').classList.add('open');
      throw e;
    });
    return peoplePromise;
  }

  function refreshDropdown() {
    var q = document.getElementById('person-search').value.trim().toLowerCase();
    filtered = q
      ? allPeople.filter(function(p){ return String(p.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8)
      : allPeople.slice(0, 8);
    hiIdx = -1;
    renderDrop();
    document.getElementById('search-drop').classList.add('open');
  }

  function onFocus() {
    if (document.getElementById('person-id').value) return;
    if (!peopleLoaded && !peopleLoading) fetchPeople();
    if (peopleLoaded) refreshDropdown();
    else showDropLoading();
  }

  function onInput() {
    if (!peopleLoaded) {
      if (!peopleLoading) fetchPeople();
      else showDropLoading();
      return;
    }
    refreshDropdown();
  }

  function renderDrop() {
    var box = document.getElementById('search-drop');
    if (!filtered.length) {
      box.innerHTML = '<div class="no-results">No contacts found</div>';
      return;
    }
    box.innerHTML = filtered.map(function(p, i){
      return '<div class="drop-item" data-action="pick-person-drop" data-idx="' + i + '"><div class="drop-av">' + ini(p.name) + '</div>' + esc(p.name) + '</div>';
    }).join('');
  }

  function onKey(e) {
    var box = document.getElementById('search-drop');
    if (!box.classList.contains('open') || !filtered.length) return;
    var items = box.querySelectorAll('.drop-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); hiIdx = Math.min(hiIdx + 1, items.length - 1); hlDrop(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hiIdx = Math.max(hiIdx - 1, 0); hlDrop(items); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hiIdx >= 0) pickPersonFromDrop(hiIdx); else if (filtered.length === 1) pickPersonFromDrop(0); }
    else if (e.key === 'Escape') closeDrop();
  }

  function hlDrop(items) {
    items.forEach(function(el, i){ el.style.background = i === hiIdx ? 'var(--accent-soft)' : ''; });
  }

  function pickPersonFromDrop(idx) {
    var p = filtered[idx];
    if (!p) return;
    applyPersonSelection(p);
  }

  function applyPersonSelection(p) {
    document.getElementById('person-id').value = p.id || '';
    document.getElementById('person-search').value = '';
    document.getElementById('person-search').style.display = 'none';
    document.getElementById('sel-av').textContent = ini(p.name);
    document.getElementById('sel-name').textContent = p.name || p.id || '';
    document.getElementById('sel-pill').classList.add('on');
    closeDrop();
    showMsg('', '');
    loadRecentInteractions(p.id);
  }

  var recentOpen = false;

  function loadRecentInteractions(pid) {
    var wrap  = document.getElementById('recent-interactions');
    var body  = document.getElementById('recent-body');
    var lbl   = document.getElementById('recent-toggle-label');
    var arrow = document.getElementById('recent-toggle-arrow');
    // Reset to closed while loading
    recentOpen = false;
    body.style.display = 'none';
    if (arrow) arrow.style.transform = '';
    lbl.textContent = 'Recent interactions';
    wrap.style.display = 'block';
    apiFetch('getInteractions', { personId: pid }).then(function(list) {
      if (!Array.isArray(list) || !list.length) {
        lbl.textContent = 'No previous interactions';
        body.innerHTML = '';
        return;
      }
      var recentCount = Math.min(list.length, 3);
      lbl.textContent = 'Recent interactions (' + recentCount + ')';
      var top3 = list.slice(0, 3);
      var h = '<div class="recent-body-wrap">';
      top3.forEach(function(i) {
        var badgeCls = i.outcome === 'Successful' ? 'rb-reached'
          : i.result === 'Left Message' ? 'rb-message'
          : i.result === 'Rescheduled Call' ? 'rb-resched'
          : 'rb-attempt';
        h += '<div class="recent-card">';
        h += '<div class="recent-top"><span class="recent-date">' + esc(i.timestamp) + '</span><span class="recent-badge ' + badgeCls + '">' + esc(i.result) + '</span></div>';
        if (i.summary) h += '<div class="recent-note">' + esc(i.summary) + '</div>';
        h += '</div>';
      });
      if (list.length > 3) {
        h += '<div style="padding:9px 14px;border-top:1px solid var(--line);"><button type="button" data-action="go-history-person" data-pid="' + esc(pid) + '" style="background:none;border:none;font-family:inherit;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;padding:0;">View full history (' + list.length + ' total) ></button></div>';
      }
      h += '</div>';
      body.innerHTML = h;
      // Auto-open after data loads
      recentOpen = true;
      body.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    }).catch(function(e) {
      wrap.style.display = 'none';
      console.warn('[Flock]', e);
    });
  }

  function toggleRecent() {
    var body  = document.getElementById('recent-body');
    var arrow = document.getElementById('recent-toggle-arrow');
    recentOpen = !recentOpen;
    body.style.display  = recentOpen ? 'block' : 'none';
    if (arrow) arrow.style.transform = recentOpen ? 'rotate(180deg)' : '';
  }

  function clearPerson() {
    document.getElementById('person-id').value = '';
    document.getElementById('person-search').value = '';
    document.getElementById('person-search').style.display = '';
    document.getElementById('sel-pill').classList.remove('on');
    document.getElementById('person-search').focus();
    recentOpen = false;
    if (window.clearTodoItems) window.clearTodoItems();
    var ri = document.getElementById('recent-interactions');
    if (ri) ri.style.display = 'none';
    var rb = document.getElementById('recent-body');
    if (rb) { rb.style.display = 'none'; rb.innerHTML = ''; }
    var arr = document.getElementById('recent-toggle-arrow');
    if (arr) arr.style.transform = '';
    var lbl = document.getElementById('recent-toggle-label');
    if (lbl) lbl.textContent = 'Recent interactions';
  }

  function closeDrop() {
    document.getElementById('search-drop').classList.remove('open');
    hiIdx = -1;
  }

  document.addEventListener('click', function(e){
    var wrap = document.getElementById('search-wrap');
    var pill = document.getElementById('sel-pill');
    var drop = document.getElementById('search-drop');
    if (!wrap.contains(e.target) && !pill.contains(e.target) && !drop.contains(e.target)) closeDrop();
  });

  document.addEventListener('click', function(e){
    var actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      var action = actionEl.getAttribute('data-action');
      if (action === 'pick-person-drop') { pickPersonFromDrop(Number(actionEl.getAttribute('data-idx') || -1)); return; }
      if (action === 'go-history-person') { goHistoryPerson(actionEl.getAttribute('data-pid') || ''); return; }
      if (action === 'save-app-setting') { saveAppSetting(actionEl.getAttribute('data-key') || ''); return; }
      if (action === 'save-cad') { saveCad(actionEl.getAttribute('data-pid') || ''); return; }
      if (action === 'open-edit-modal') { openEditModal(actionEl.getAttribute('data-pid') || ''); return; }
      if (action === 'set-analytics-range') { setAnalyticsRange(actionEl.getAttribute('data-range') || '1m'); return; }
      if (action === 'open-bsheet') { openBsheet(actionEl.getAttribute('data-pid') || '', actionEl.getAttribute('data-name') || '', 'who_to_call'); return; }
    }
    var dashRow = e.target.closest('.js-dash-open');
    var dashLog = e.target.closest('.js-dash-log');
    if (dashLog) {
      e.preventDefault();
      e.stopPropagation();
      openBsheet(dashLog.getAttribute('data-pid') || '', dashLog.getAttribute('data-name') || '', 'who_to_call');
      return;
    }
    if (dashRow) {
      openBsheet(dashRow.getAttribute('data-pid') || '', dashRow.getAttribute('data-name') || '', 'who_to_call');
      return;
    }
    var histPerson = e.target.closest('.js-hist-person');
    if (histPerson) {
      pickHistPersonFromList(histPerson);
      return;
    }
    var histLog = e.target.closest('.js-hist-log');
    if (histLog) {
      goLogPerson(histLog.getAttribute('data-pid') || '', histLog.getAttribute('data-name') || '');
    }
  });

  function pickResult(btn) {
    document.querySelectorAll('.chip').forEach(function(c){ c.className = 'chip'; });
    selResult = btn.dataset.r;
    var cls = { 'Reached':'c-reached', 'No Answer':'c-noanswer', 'Left Message':'c-message', 'Rescheduled Call':'c-resched' };
    btn.className = 'chip ' + (cls[selResult] || '');
    showMsg('', '');
  }

  function pickAction(btn) {
    document.querySelectorAll('.ac').forEach(function(c){ c.className = 'ac'; });
    selAction = btn.dataset.a;
    btn.className = 'ac ' + (selAction === 'None' ? 'a-none a-sel' : 'a-sel');
    var dw = document.getElementById('dateWrap');
    if (selAction === 'Callback' || selAction === 'Follow-up') dw.classList.add('on');
    else { dw.classList.remove('on'); document.getElementById('next-dt').value = ''; }
  }

  function showMsg(text, cls) {
    var el = document.getElementById('msg-bar');
    el.className = 'msg ' + (cls || '');
    el.textContent = text || '';
  }

  function setSaving(v) {
    saving = v;
    var b = document.getElementById('save-btn');
    b.disabled = v;
    b.textContent = v ? 'Saving...' : 'Save Call';
  }

  function _origSaveCall() {
    if (saving) return;
    var pid = document.getElementById('person-id').value;
    var ndt = document.getElementById('next-dt').value;
    var sum = document.getElementById('summary').value.trim();
    if (!pid) { showMsg('Please select a person.', 'error'); return; }
    if (!selResult) { showMsg('Please choose a result.', 'error'); return; }
    if ((selAction === 'Callback' || selAction === 'Follow-up') && !ndt) { showMsg('Please set a date.', 'error'); return; }
    var p = allPeople.find(function(x){ return String(x.id) === String(pid); });
    var name = p ? p.name : (document.getElementById('sel-name').textContent || pid);
    var payload = { personId:pid, fullName:name, result:selResult, nextAction:selAction, summary:sum, nextActionDateTime:ndt || null };
    var sig = JSON.stringify(payload);
    if (sig === lastSig && (Date.now() - lastAt) < 15000) { showMsg('This call was just saved - tap "Log another call" to continue.', 'info'); return; }
    setSaving(true); showMsg('Saving...', 'info');
    apiPost('saveInteraction', { payload: payload })
      .then(function(res){
        setSaving(false);
        if (res && res.success) {
          hapticTick_();
          _homeQuickStatsCache = null;
          lastSig = sig; lastAt = Date.now();
          // Capture pending action item text, then save action items if any
          if (window.flushPendingLogTodoItem) window.flushPendingLogTodoItem();
          var todoItems = (window.getTodoItems ? window.getTodoItems() : []);
          if (todoItems.length) {
            var interactionId = (res && (res.interactionId || res.interactionID || res.id)) || ('manual-' + Date.now());
            apiPost('saveTodos', { payload: {
              interactionId: interactionId,
              personId: pid,
              personName: name,
              todos: todoItems.map(function(t){
                if (t && typeof t === 'object') {
                  return { text: String(t.text || ''), dueDate: String(t.dueDate || '') };
                }
                return { text: String(t || ''), dueDate: '' };
              }).filter(function(t){ return String(t.text || '').trim(); })
            } }).catch(function(e){ console.warn('[Flock]', e); });
          }
          document.getElementById('log-form').style.display = 'none';
          document.getElementById('success-sub').textContent = 'Call with ' + name + ' has been saved.' + (todoItems.length ? ' ' + todoItems.length + ' action item' + (todoItems.length > 1 ? 's' : '') + ' added.' : '');
          document.getElementById('success-screen').classList.add('on');
          document.getElementById('save-bar').style.display = 'none';
        } else {
          showMsg('Save failed: ' + (res && res.error ? res.error : 'Unknown error.'), 'error');
        }
      })
      .catch(function(e){ setSaving(false); showMsg('Error: ' + String(e), 'error'); });
  }

  function resetLog() {
    document.getElementById('log-form').style.display = 'block';
    document.getElementById('success-screen').classList.remove('on');
    document.getElementById('save-bar').style.display = 'block';
    preselPid = null;
    preselName = null;
    initLogPage();
  }

  function resetLogForm() {
    clearPerson();
    document.getElementById('person-search').style.display = '';
    document.querySelectorAll('.chip').forEach(function(c){ c.className = 'chip'; });
    document.querySelectorAll('.ac').forEach(function(c){ c.className = 'ac'; });
    document.querySelector('[data-a="None"]').className = 'ac a-none a-sel';
    document.getElementById('next-dt').value = '';
    document.getElementById('dateWrap').classList.remove('on');
    document.getElementById('summary').value = '';
    document.getElementById('log-form').style.display = 'block';
    document.getElementById('success-screen').classList.remove('on');
    document.getElementById('save-bar').style.display = 'block';
    selResult = '';
    selAction = 'None';
    showMsg('', '');
    setSaving(false);
    if (window.clearTodoItems) window.clearTodoItems();
    var ri = document.getElementById('recent-interactions');
    if (ri) ri.style.display = 'none';
  }

  // â”€â”€ History page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var histActivePid = null;
  var histPreselPid = null;


