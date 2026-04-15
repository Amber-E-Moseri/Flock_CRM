
  var API = 'https://script.google.com/macros/s/AKfycbxIyopzk2Lg2joe_7AWLJhofkEKy4k8sDQBOJ9OtxYhQW7sh98nCuLWLMblpmh7ogC6/exec';
  //  Hash-based routing 
  var HASH_MAP = {
    'home':        'pg-home',
    'dashboard':   'pg-dash',
    'log':         'pg-log',
    'history':     'pg-history',
    'settings':    'pg-settings',
    'appsettings': 'pg-appsettings',
    'cadence':     'pg-cadence',
    'addperson':   'pg-addperson',
    'analytics':   'pg-analytics',
    'search':      'pg-search',
    'guide':       'pg-guide',
    'todos':       'pg-todos'
  };
  var PAGE_HASH = {};
  Object.keys(HASH_MAP).forEach(function(h){ PAGE_HASH[HASH_MAP[h]] = h; });

  var _navigating = false;
  var _addPersonReturn = null;

  function activePageId_() {
    var active = document.querySelector('.page.active');
    return active ? active.id : 'pg-home';
  }

  function showPage(id, pushState) {
    var currentId = activePageId_();
    if (id === 'pg-addperson' && currentId !== 'pg-addperson') {
      _addPersonReturn = { page: currentId || 'pg-home', scrollY: window.scrollY || 0 };
    }
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    window.scrollTo(0,0);
    // Update hash without triggering hashchange handler
    if (pushState !== false) {
      _navigating = true;
      window.location.hash = PAGE_HASH[id] || 'home';
      setTimeout(function(){ _navigating = false; }, 50);
    }
    if (id === 'pg-dash')         loadDash();
    if (id === 'pg-log')          initLogPage();
    if (id === 'pg-home')         loadHome();
    if (id === 'pg-history')      initHistoryPage();
    if (id === 'pg-settings')     { initSettingsPage(); }
    if (id === 'pg-appsettings')  loadAppSettings();
    if (id === 'pg-cadence')      initCadencePage();
    if (id === 'pg-addperson')    initAddPersonPage();
    if (id === 'pg-analytics')    loadAnalytics();
    if (id === 'pg-todos')         loadTodos();
    if (id === 'pg-search') {
      setTimeout(function(){
        var inp = document.getElementById('search-page-input');
        if (inp) inp.focus();
      }, 120);
    }
    // close bottom sheet and stop voice when navigating away
    if (id !== 'pg-search') stopVoice && stopVoice();
  }

  function openAddPerson() {
    showPage('pg-addperson');
  }
  window.openAddPerson = openAddPerson;

  function returnFromAddPerson() {
    var ret = _addPersonReturn || { page: 'pg-home', scrollY: 0 };
    showPage(ret.page || 'pg-home');
    setTimeout(function(){ window.scrollTo(0, Number(ret.scrollY) || 0); }, 40);
  }
  window.returnFromAddPerson = returnFromAddPerson;

  window.addEventListener('hashchange', function() {
    if (_navigating) return;
    var hash = window.location.hash.replace('#', '');
    var pageId = HASH_MAP[hash] || 'pg-home';
    showPage(pageId, false);
  });

  function apiFetch(action, params) {
    var url = API + '?action=' + action;
    if (params) {
      Object.keys(params).forEach(function(k){
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      });
    }
    return fetch(url, { method: 'GET', redirect: 'follow' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function(text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error('Response was not JSON: ' + text.slice(0, 200));
        }
      });
  }

  function loadHome() {
    var h = new Date().getHours();
    var gr = 'Good morning';
    // Use cached name if available, else fetch from settings
    if (window._userName) {
      document.getElementById('home-greeting').textContent = gr + ', ' + window._userName + '.';
    } else {
      apiFetch('getSettings').then(function(settings) {
        var nameEntry = Array.isArray(settings) && settings.find(function(s){ return s.key === 'YOUR_NAME'; });
        window._userName = (nameEntry && nameEntry.val) ? nameEntry.val : '';
        document.getElementById('home-greeting').textContent = gr + ', ' + window._userName + '.';
      }).catch(function(){
        document.getElementById('home-greeting').textContent = gr + '.';
      });
    }
    apiFetch('quickStats').then(function(d){
      document.getElementById('h-cb').textContent = d.callbacks || 0;
      document.getElementById('h-ov').textContent = d.overdue || 0;
      document.getElementById('h-td').textContent = d.today || 0;
    }).catch(function(){});
  }

  var SECS = [
    { key:'callbacks', id:'s-cb', sn:'sn-cb', label:'Callbacks',  pip:'pip-cb', badge:'badge-cb', av:'av-cb', row:'row-cb', when:function(p){ return p.callbackDue ? 'Callback due ' + p.callbackDue : 'Open callback'; } },
    { key:'overdue',   id:'s-ov', sn:'sn-ov', label:'Overdue',    pip:'pip-ov', badge:'badge-ov', av:'av-ov', row:'row-ov', when:function(p){ return p.nextDueDate ? 'Was due ' + p.nextDueDate : 'Overdue'; } },
    { key:'today',     id:'s-td', sn:'sn-td', label:'Due Today',  pip:'pip-td', badge:'badge-td', av:'av-td', row:'row-td', when:function(){ return 'Due today'; } },
    { key:'thisWeek',  id:'s-wk', sn:'sn-wk', label:'This Week',  pip:'pip-wk', badge:'badge-wk', av:'av-wk', row:'row-wk', when:function(p){ return p.nextDueDate ? 'Due ' + p.nextDueDate : 'This week'; } },
    { key:'nextWeek',  id:'s-nx', sn:null,     label:'Next Week',  pip:'pip-nx', badge:'badge-nx', av:'av-nx', row:'row-nx', when:function(p){ return p.nextDueDate ? 'Due ' + p.nextDueDate : 'Next week'; } },
    { key:'noDate',    id:'s-nd', sn:'sn-nd',  label:'No Date Set',pip:'pip-nd', badge:'badge-nd', av:'av-nd', row:'row-nd', when:function(){ return 'No due date \u2014 call when ready'; } }
  ];

  function ini(name){ if(!name) return '?'; var p = String(name).trim().split(/\s+/); return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase(); }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function renderSection(sec, people) {
    var arr = Array.isArray(people) ? people : [];
    var h = '<div class="section" id="' + sec.id + '">';
    h += '<div class="sec-head"><span class="sec-pip ' + sec.pip + '"></span><span class="sec-title2">' + esc(sec.label) + '</span><span class="sec-badge ' + sec.badge + '">' + arr.length + '</span></div>';
    if (!arr.length) {
      h += '<div class="empty-row">None - all clear here </div>';
    } else arr.forEach(function(p){
      var pid = esc(p.id);
      h += '<div class="person-row ' + sec.row + '" data-pid="' + pid + '" data-sec="' + sec.id + '" onclick="openBsheet(\'' + pid + '\',\'' + esc(p.name) + '\',\'who_to_call\')">';
      h += '<div class="av ' + sec.av + '">' + esc(ini(p.name)) + '</div>';
      h += '<div class="row-info"><div class="row-name">' + esc(p.name || 'Unnamed') + '</div>';
      h += '<div class="row-meta"><span class="row-when">' + esc(sec.when(p)) + '</span>';
      if (p.priority) h += '<span class="row-pill">' + esc(p.priority) + '</span>';
      if (p.lastAttempt) h += '<span class="row-pill">Last: ' + esc(p.lastAttempt) + '</span>';
      h += '</div></div>';
      h += '<button class="log-btn" data-pid="' + pid + '" onclick="event.stopPropagation();openBsheet(\'' + pid + '\',\'' + esc(p.name) + '\',\'who_to_call\')" >Log</button>';
      h += '</div>';
      // No notes dropdown on the Who to Call page - notes are in Past Notes
    });
    h += '</div>';
    return h;
  }

  function renderDash(data) {
    // Be defensive: include explicit noDate rows and also any "Scheduled" person
    // that might arrive in another bucket due to stale backend payloads.
    var noDate = (data.noDate || []).slice();
    var noDateSeen = {};
    noDate.forEach(function(p){ noDateSeen[String(p && p.id || '')] = true; });

    ['callbacks','overdue','today','thisWeek','nextWeek'].forEach(function(key){
      var arr = data[key] || [];
      var kept = [];
      arr.forEach(function(p){
        var st = String((p && p.status) || '').trim().toLowerCase();
        var pid = String((p && p.id) || '');
        var shouldBeNoDate = (st === 'scheduled') || !(p && p.nextDueDate);
        if (shouldBeNoDate) {
          if (!noDateSeen[pid]) {
            noDate.push(p);
            noDateSeen[pid] = true;
          }
        } else {
          kept.push(p);
        }
      });
      data[key] = kept;
    });

    data = Object.assign({}, data, { noDate: noDate });

    var h = '<div class="shell">';
    SECS.forEach(function(s) {
      if (s.key === 'noDate' && !(data.noDate || []).length) return;
      h += renderSection(s, data[s.key]);
    });
    h += '</div>';
    document.getElementById('dash-body').innerHTML = h;
    document.getElementById('sum-strip').style.display = 'flex';
    document.getElementById('sn-cb').textContent = (data.callbacks || []).length;
    document.getElementById('sn-ov').textContent = (data.overdue || []).length;
    document.getElementById('sn-td').textContent = (data.today || []).length;
    document.getElementById('sn-wk').textContent = (data.thisWeek || []).length;
    document.getElementById('sn-nx').textContent = (data.nextWeek || []).length;
    document.getElementById('sn-nd').textContent = (data.noDate || []).length;
    var noDateCell = document.getElementById('sum-nd');
    if (noDateCell) noDateCell.style.display = (data.noDate || []).length ? '' : 'none';
    // Jump to section if triggered from home stat boxes
    if (dashJumpTarget) {
      var target = dashJumpTarget;
      dashJumpTarget = null;
      setTimeout(function(){ jumpTo(target); }, 80);
    }
  }

  function showDashLoading() {
    document.getElementById('sum-strip').style.display = 'none';
    var h = '<div class="shell">';
    for (var i = 0; i < 3; i++) h += '<div class="skel-hd"></div><div class="skel"></div><div class="skel"></div>';
    h += '</div>';
    document.getElementById('dash-body').innerHTML = h;
  }

  var _dashLoadSeq = 0;
  var _dashDueSnapshot = null;
  var _dashTodaySnapshot = null;

  function applyDashTodayCount(today) {
    var el = document.getElementById('dash-today-count');
    if (!el) return;
    var n = Number(today && today.count) || 0;
    el.textContent = n + (n === 1 ? ' call logged today' : ' calls logged today');
  }

  function loadDash() {
    var seq = ++_dashLoadSeq;
    if (_dashDueSnapshot) renderDash(_dashDueSnapshot);
    else showDashLoading();
    if (_dashTodaySnapshot) applyDashTodayCount(_dashTodaySnapshot);

    apiFetch('duePeople')
      .then(function(due){
        if (seq !== _dashLoadSeq) return;
        _dashDueSnapshot = due || {};
        renderDash(_dashDueSnapshot);
      })
      .catch(function(e){
        if (seq !== _dashLoadSeq) return;
        document.getElementById('dash-body').innerHTML = '<div class="err-box">Could not load data. Try refreshing.<br><small>' + esc(String(e)) + '</small></div>';
      });

    apiFetch('getTodayCount')
      .then(function(today){
        if (seq !== _dashLoadSeq) return;
        _dashTodaySnapshot = today || {};
        applyDashTodayCount(_dashTodaySnapshot);
      })
      .catch(function(){});
  }

  function jumpTo(id){ var el = document.getElementById(id); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}); }

  var dashJumpTarget = null;

  function goToDashSection(sectionId) {
    dashJumpTarget = sectionId;
    showPage('pg-dash');
  }

  var allPeople = [], filtered = [], hiIdx = -1, selResult = '', selAction = 'None';
  var saving = false, lastSig = '', lastAt = 0;
  var preselPid = null, preselName = null;
  var peopleLoaded = false, peopleLoading = false, peoplePromise = null;

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
    peoplePromise = apiFetch('people').then(function(list){
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
      return '<div class="drop-item" onclick="pickPersonFromDrop(' + i + ')"><div class="drop-av">' + ini(p.name) + '</div>' + esc(p.name) + '</div>';
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
        h += '<div style="padding:9px 14px;border-top:1px solid var(--line);"><button type="button" onclick="goHistoryPerson(\'' + esc(pid) + '\')" style="background:none;border:none;font-family:inherit;font-size:12px;font-weight:600;color:var(--accent);cursor:pointer;padding:0;">View full history (' + list.length + ' total) ></button></div>';
      }
      h += '</div>';
      body.innerHTML = h;
      // Auto-open after data loads
      recentOpen = true;
      body.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    }).catch(function() {
      wrap.style.display = 'none';
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
    apiFetch('saveInteraction', { payload: JSON.stringify(payload) })
      .then(function(res){
        setSaving(false);
        if (res && res.success) {
          lastSig = sig; lastAt = Date.now();
          // Capture pending action item text, then save action items if any
          if (window.flushPendingLogTodoItem) window.flushPendingLogTodoItem();
          var todoItems = (window.getTodoItems ? window.getTodoItems() : []);
          if (todoItems.length) {
            var interactionId = (res && (res.interactionId || res.interactionID || res.id)) || ('manual-' + Date.now());
            apiFetch('saveTodos', { payload: JSON.stringify({
              interactionId: interactionId,
              personId: pid,
              personName: name,
              todos: todoItems.map(function(t){
                if (t && typeof t === 'object') {
                  return { text: String(t.text || ''), dueDate: String(t.dueDate || '') };
                }
                return { text: String(t || ''), dueDate: '' };
              }).filter(function(t){ return String(t.text || '').trim(); })
            }) }).catch(function(){});
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

  function goHistoryPerson(pid) {
    histPreselPid = pid;
    showPage('pg-history');
  }

  function initHistoryPage() {
    var hf = document.getElementById('hist-filter');
    if (hf) hf.value = '';
    if (histPreselPid) {
      histActivePid = histPreselPid;
      histPreselPid = null;
    } else {
      histActivePid = null;
    }
    if (peopleLoaded) {
      renderHistPeopleList(allPeople);
    } else {
      document.getElementById('hist-people-list').innerHTML =
        '<div class="people-loading" style="padding:20px 0"><span>Loading contacts</span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
      fetchPeople().then(function(){ renderHistPeopleList(allPeople); });
    }
  }

  function filterHistPeople() {
    var q = document.getElementById('hist-filter').value.trim().toLowerCase();
    var list = q ? allPeople.filter(function(p){ return p.name.toLowerCase().indexOf(q) >= 0; }) : allPeople;
    renderHistPeopleList(list);
  }

  function renderHistPeopleList(list) {
    var el = document.getElementById('hist-people-list');
    if (!list.length) { el.innerHTML = '<div class="hist-empty">No contacts found.</div>'; return; }
    el.innerHTML = list.map(function(p) {
      var pid = esc(p.id);
      var isActive = histActivePid === String(p.id);
      var rowCls = 'hist-person-row' + (isActive ? ' active' : '');
      var arrowChar = isActive ? 'v' : '>';
      return '<div class="' + rowCls + '" data-pid="' + pid + '" data-name="' + esc(p.name) + '" onclick="pickHistPersonFromList(this)">' +
        '<div class="hist-pav">' + esc(ini(p.name)) + '</div>' +
        '<span class="hist-pname">' + esc(p.name) + '</span>' +
        '<span class="hist-parrow" id="harrow-' + pid + '">' + arrowChar + '</span>' +
      '</div>' +
      '<div class="hist-inline" id="hinline-' + pid + '" style="' + (isActive ? '' : 'display:none') + '"></div>';
    }).join('');
    // if one was already active, re-load its results
    if (histActivePid) {
      var activeEl = document.querySelector('[data-pid="' + histActivePid + '"]');
      if (activeEl) {
        var name = activeEl.getAttribute('data-name');
        renderHistInline(histActivePid, name);
      }
    }
  }

  function pickHistPersonFromList(el) {
    var pid  = el.getAttribute('data-pid');
    var name = el.getAttribute('data-name');
    // toggle: clicking the same person collapses it
    if (histActivePid === pid) {
      histActivePid = null;
      var q = document.getElementById('hist-filter').value.trim().toLowerCase();
      renderHistPeopleList(q ? allPeople.filter(function(p){ return p.name.toLowerCase().indexOf(q) >= 0; }) : allPeople);
      return;
    }
    histActivePid = pid;
    var q = document.getElementById('hist-filter').value.trim().toLowerCase();
    renderHistPeopleList(q ? allPeople.filter(function(p){ return p.name.toLowerCase().indexOf(q) >= 0; }) : allPeople);
  }

    function renderHistInline(pid, name) {
    var panel = document.getElementById('hinline-' + pid);
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = '<div class="hist-inline-empty">Loading...</div>';
    apiFetch('getInteractions', { personId: pid }).then(function(list) {
      var h = '<div class="hist-inline-topbar">' +
        '<button class="hist-inline-log-btn" onclick="goLogPerson(\'' + esc(pid) + '\',\'' + esc(name) + '\')" title="Log call for ' + esc(name) + '" aria-label="Log call for ' + esc(name) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.7 15.7 0 0 0 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1 .3 2 .5 3 .5.7 0 1.2.5 1.2 1.2V20c0 .7-.5 1.2-1.2 1.2C10.9 21.2 2.8 13.1 2.8 3.2 2.8 2.5 3.3 2 4 2h3.4c.7 0 1.2.5 1.2 1.2 0 1 .2 2 .5 3 .1.4 0 .9-.3 1.2l-2.2 2.4z"></path></svg>' +
        '</button>' +
        '</div>';
      if (!Array.isArray(list) || !list.length) {
        h += '<div class="hist-inline-empty">No call history yet.</div>';
        panel.innerHTML = h;
        return;
      }
      list.forEach(function(i) {
        var badgeCls = i.outcome === 'Successful' ? 'hb-reached'
          : i.result === 'Left Message' ? 'hb-message'
          : i.result === 'Rescheduled Call' ? 'hb-resched'
          : 'hb-attempt';
        h += '<div class="hist-inline-card">';
        h += '<div class="hist-top"><span class="hist-date">' + esc(i.timestamp) + '</span><span class="hist-badge ' + badgeCls + '">' + esc(i.result || i.outcome) + '</span></div>';
        if (i.summary) h += '<div class="hist-notes">' + esc(i.summary) + '</div>';
        if (i.nextAction && i.nextAction !== 'None') h += '<div class="hist-next">Next: ' + esc(i.nextAction) + (i.nextDt ? ' · ' + esc(i.nextDt) : '') + '</div>';
        h += '</div>';
      });
      panel.innerHTML = h;
    }).catch(function() {
      panel.innerHTML = '<div class="hist-inline-empty">Could not load history.</div>';
    });
  }
function renderHistory(list, personName) {
    var el = document.getElementById('hist-results');
    if (!Array.isArray(list) || !list.length) {
      el.innerHTML = '<div class="hist-empty">No call history found for this person.</div>';
      return;
    }
    var countLabel = list.length === 1 ? '1 interaction' : list.length + ' interactions';
    var h = '<div class="hist-person-hdr">';
    h += '<div class="hist-person-av">' + esc(ini(personName)) + '</div>';
    h += '<div><div class="hist-person-name">' + esc(personName) + '</div><div class="hist-person-sub">' + countLabel + '</div></div>';
    h += '</div>';
    list.forEach(function(i) {
      var badgeCls = i.outcome === 'Successful' ? 'hb-reached'
                   : i.result  === 'Left Message'       ? 'hb-message'
                   : i.result  === 'Rescheduled Call'   ? 'hb-resched'
                   : 'hb-attempt';
      h += '<div class="hist-card">';
      h += '<div class="hist-top"><span class="hist-date">' + esc(i.timestamp) + '</span><span class="hist-badge ' + badgeCls + '">' + esc(i.result || i.outcome) + '</span></div>';
      if (i.summary) h += '<div class="hist-notes">' + esc(i.summary) + '</div>';
      if (i.nextAction && i.nextAction !== 'None') {
        h += '<div class="hist-next">Next: ' + esc(i.nextAction) + (i.nextDt ? ' · ' + esc(i.nextDt) : '') + '</div>';
      }
      h += '</div>';
    });
    el.innerHTML = h;
  }

  // â”€â”€ Settings pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var cadPeople = [];
  var cadSessionLoaded = false;
  var cadSessionDirty  = false;

  function initCadencePage() {
    document.getElementById('cad-filter').value = '';
    if (cadSessionLoaded && !cadSessionDirty) {
      renderCadence(cadPeople);
      return;
    }
    cadPeople = [];
    loadCadencePeople();
  }

  function loadAppSettings() {
    var el = document.getElementById('app-settings-list');
    el.innerHTML = '<div class="people-loading" style="padding:16px 0"><span>Loading</span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    apiFetch('getSettings').then(function(list) {
      if (!Array.isArray(list) || !list.length) { el.innerHTML = '<div class="hist-empty">No settings found.</div>'; return; }
      var SETTING_ICONS = {
        'NOTIFICATIONS_ENABLED': '[Notify]',
        'REMINDER_EMAIL':        '[Mail]',
        'MORNING_REMINDER_HOUR': '[Morning]',
        'DUESTATUS_REFRESH_HOUR':'[Refresh]',
        'MONDAY_FOLLOWUPS_HOUR': '[Weekly]',
        'TIMEZONE':              '[TZ]',
        'YOUR_NAME':             '[Name]'
      };
      el.innerHTML = list.map(function(s) {
        var keyRaw = String((s && s.key) || '').trim();
        var keyNorm = keyRaw.toUpperCase();
        var k    = esc(keyRaw);
        var icon = SETTING_ICONS[keyNorm] || '[Setting]';
        var ctrlHtml = '';
        if (keyNorm === 'NOTIFICATIONS_ENABLED') {
          var raw = String(s.val == null ? '' : s.val).trim().toLowerCase();
          var isOn = raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
          ctrlHtml =
            '<input type="hidden" class="aset-input" id="aset-' + k + '" value="' + (isOn ? 'true' : 'false') + '">' +
            '<div class="aset-inline-divider"></div>' +
            '<div class="aset-switch-row">' +
              '<div class="aset-switch-label">Enable notifications</div>' +
              '<div class="sw-wrap">' +
                '<span class="sw-label ' + (isOn ? 'on' : 'off') + '" id="notif-enabled-label-main">' + (isOn ? 'On' : 'Off') + '</span>' +
                '<label class="sw">' +
                  '<input type="checkbox" id="notif-enabled-toggle-main" ' + (isOn ? 'checked' : '') + ' onchange="asetPickBool(\'' + k + '\', this.checked);saveAppSetting(\'' + k + '\');(function(lbl){if(lbl){lbl.textContent=this.checked?\'On\':\'Off\';lbl.className=\'sw-label \'+(this.checked?\'on\':\'off\');}}).call(this, document.getElementById(\'notif-enabled-label-main\'));">' +
                  '<span class="sw-track"></span>' +
                '</label>' +
              '</div>' +
            '</div>' +
            '<div class="aset-row-ctrl aset-row-ctrl-bool" style="justify-content:flex-end;margin-top:8px;">' +
              '<span class="aset-status" id="asstat-' + k + '"></span>' +
            '</div>';
        } else {
          ctrlHtml =
            '<div class="aset-row-ctrl">' +
              '<input class="aset-input" id="aset-' + k + '" value="' + esc(s.val) + '" placeholder="-">' +
              '<button class="aset-save" id="assave-' + k + '" onclick="saveAppSetting(\'' + k + '\')">Save</button>' +
              '<span class="aset-status" id="asstat-' + k + '"></span>' +
            '</div>';
        }
        return '<div class="aset-row">' +
          '<div class="aset-label">' + icon + ' ' + esc(s.label || keyRaw) + '</div>' +
          (s.desc ? '<div class="aset-desc">' + esc(s.desc) + '</div>' : '') +
          ctrlHtml +
        '</div>';
      }).join('');
    }).catch(function(e) {
      el.innerHTML = '<div class="err-box">Could not load settings.<br><small>' + esc(String(e)) + '</small></div>';
    });
  }


  function initSettingsPage() {
    var inp = document.getElementById("settings-your-name");
    if (!inp) return;
    if (window._userName) { inp.value = window._userName === "Pastor" ? "" : window._userName; return; }
    apiFetch("getSettings").then(function(list) {
      var entry = Array.isArray(list) && list.find(function(s){ return s.key === "YOUR_NAME"; });
      var name = (entry && entry.val) ? entry.val : "";
      inp.value = name;
      window._userName = name || "";
    }).catch(function(){});
  }

  function saveYourName() {
    var inp  = document.getElementById("settings-your-name");
    var btn  = document.getElementById("your-name-btn");
    var stat = document.getElementById("your-name-status");
    if (!inp) return;
    var val = inp.value.trim();
    if (!val) { if (stat) { stat.textContent = "Please enter a name."; stat.style.color = "var(--danger)"; } return; }
    btn.disabled = true; btn.textContent = "...";
    apiFetch("saveSetting", { key: "YOUR_NAME", val: val }).then(function(res) {
      btn.disabled = false; btn.textContent = "Save";
      if (res && res.success) {
        window._userName = val;
        var greetEl = document.getElementById("home-greeting");
        if (greetEl) { var h = new Date().getHours(); var gr = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; greetEl.textContent = gr + ", " + val + "."; }
        if (stat) { stat.textContent = "Saved!"; stat.style.color = "var(--success)"; setTimeout(function(){ stat.textContent = ""; }, 2500); }
      } else {
        if (stat) { stat.textContent = "Error saving."; stat.style.color = "var(--danger)"; }
      }
    }).catch(function() {
      btn.disabled = false; btn.textContent = "Save";
      if (stat) { stat.textContent = "Error saving."; stat.style.color = "var(--danger)"; }
    });
  }

  function saveAppSetting(key) {
    var inp  = document.getElementById('aset-' + key);
    var btn  = document.getElementById('assave-' + key);
    var stat = document.getElementById('asstat-' + key);
    if (!inp) return;
    var val = inp.value;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    apiFetch('saveSetting', { key: key, val: val }).then(function(res) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      if (res && res.success) {
        if (key === 'YOUR_NAME') {
          window._userName = val.trim() || ''; // update cache immediately
          // Also update the greeting on the home screen right now if it exists
          var greetEl = document.getElementById('home-greeting');
          if (greetEl) {
            var h = new Date().getHours();
            var gr = 'Good morning';
            greetEl.textContent = window._userName ? gr + ', ' + window._userName + '.' : gr + '.';
          }
        }
        if (stat) { stat.textContent = 'OK'; stat.className = 'aset-status ok'; setTimeout(function(){ stat.textContent = ''; }, 2000); }
      } else {
        if (stat) { stat.textContent = '!'; stat.className = 'aset-status err'; }
      }
    }).catch(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      if (stat) { stat.textContent = '!'; stat.className = 'aset-status err'; }
    });
  }

  function asetPickBool(key, isOn) {
    var inp = document.getElementById('aset-' + key);
    var wrap = document.getElementById('aset-toggle-' + key);
    if (inp) inp.value = isOn ? 'true' : 'false';
    if (wrap) {
      var buttons = wrap.querySelectorAll('.aset-toggle-btn');
      if (buttons[0]) buttons[0].classList.toggle('active', !!isOn);
      if (buttons[1]) buttons[1].classList.toggle('active', !isOn);
    }
  }

  function loadCadencePeople() {
    cadPeople = [];
    var el = document.getElementById('cad-list');
    el.innerHTML = '<div class="people-loading" style="padding:28px 0"><span>Loading contacts</span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    apiFetch('getPeopleWithCadence')
      .then(function(list) {
        cadPeople = Array.isArray(list) ? list : [];
        cadSessionLoaded = true;
        cadSessionDirty  = false;
        if (!cadPeople.length) { el.innerHTML = '<div class="hist-empty">No contacts found.</div>'; return; }
        renderCadence(cadPeople);
      })
      .catch(function(e) {
        el.innerHTML = '<div class="err-box">Could not load contacts.<br><small>' + esc(String(e)) + '</small></div>';
      });
  }

  function filterCadence() {
    var q = document.getElementById('cad-filter').value.trim().toLowerCase();
    var list = q ? cadPeople.filter(function(p){ return p.name.toLowerCase().indexOf(q) >= 0; }) : cadPeople;
    renderCadence(list);
  }

  function renderCadence(list) {
    var el = document.getElementById('cad-list');
    if (!list.length) { el.innerHTML = '<div class="hist-empty">No contacts match.</div>'; return; }
    el.innerHTML = list.map(function(p) {
      var sub = [p.role, p.fellowship].filter(Boolean).join(' · ');
      var pid = esc(p.id);
      var isActive = p.active !== false;
      var lblCls = isActive ? 'on' : 'off';
      var lblTxt = isActive ? 'Active' : 'Inactive';
      return '<div class="cad-row" id="crow-' + pid + '">' +
        '<div class="cad-top">' +
          '<div class="cad-av">' + esc(ini(p.name)) + '</div>' +
          '<div class="cad-info">' +
            '<div class="cad-name">' + esc(p.name) + '</div>' +
            (sub ? '<div class="cad-sub">' + esc(sub) + '</div>' : '') +
          '</div>' +
          '<div class="sw-wrap">' +
            '<label class="sw-label ' + (isActive ? 'on' : 'off') + '" id="clab-' + pid + '">' + (isActive ? 'Active' : 'Inactive') + '</label>' +
            '<label class="sw">' +
              '<input type="checkbox" id="ctog-' + pid + '" ' + (isActive ? 'checked' : '') + ' onchange="toggleActive(\'' + pid + '\')">' +
              '<span class="sw-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="cad-bottom">' +
          '<input class="cad-input" type="number" min="1" max="365" id="cad-' + pid + '" value="' + p.cadenceDays + '">' +
          '<span class="cad-days-label">days</span>' +
          '<button class="cad-save" id="csave-' + pid + '" onclick="saveCad(\'' + pid + '\')">Save</button>' +
          '<span class="cad-status" id="cstat-' + pid + '"></span>' +
          '<button class="cad-edit" onclick="openEditModal(\'' + pid + '\')" title="Edit" style="margin-left:auto;">Edit</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function saveCad(pid) {
    var inp  = document.getElementById('cad-' + pid);
    var btn  = document.getElementById('csave-' + pid);
    var stat = document.getElementById('cstat-' + pid);
    if (!inp || !btn) return;
    var days = parseInt(inp.value);
    if (!days || days < 1) { inp.style.borderColor = 'var(--danger)'; return; }
    inp.style.borderColor = '';
    btn.disabled = true;
    btn.textContent = '...';
    apiFetch('saveCadence', { personId: pid, cadenceDays: days })
      .then(function(res) {
        btn.disabled = false;
        btn.textContent = 'Save';
        if (res && res.success) {
          var p = cadPeople.find(function(x){ return String(x.id) === String(pid); });
          if (p) p.cadenceDays = days;
          cadSessionDirty = true;
          if (stat) { stat.textContent = 'OK'; stat.className = 'cad-status ok'; setTimeout(function(){ stat.textContent = ''; }, 2000); }
        } else {
          if (stat) { stat.textContent = '!'; stat.className = 'cad-status err'; }
        }
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = 'Save';
        if (stat) { stat.textContent = '!'; stat.className = 'cad-status err'; }
      });
  }

  function toggleActive(pid) {
    var chk  = document.getElementById('ctog-' + pid);
    var lbl  = document.getElementById('clab-' + pid);
    var stat = document.getElementById('cstat-' + pid);
    if (!chk) return;
    var newActive = chk.checked;
    chk.disabled = true;
    apiFetch('setActive', { personId: pid, active: newActive ? 'true' : 'false' })
      .then(function(res) {
        chk.disabled = false;
        if (res && res.success) {
          var p = cadPeople.find(function(x){ return String(x.id) === String(pid); });
          if (p) p.active = newActive;
          cadSessionDirty = true;
          if (lbl) { lbl.textContent = newActive ? 'Active' : 'Inactive'; lbl.className = 'sw-label ' + (newActive ? 'on' : 'off'); }
          if (stat) { stat.textContent = 'OK'; stat.className = 'cad-status ok'; setTimeout(function(){ stat.textContent = ''; }, 2000); }
        } else {
          chk.checked = !newActive;
          if (lbl) { lbl.textContent = !newActive ? 'Active' : 'Inactive'; lbl.className = 'sw-label ' + (!newActive ? 'on' : 'off'); }
          if (stat) { stat.textContent = '!'; stat.className = 'cad-status err'; }
        }
      })
      .catch(function() {
        chk.disabled = false;
        chk.checked = !newActive;
        if (lbl) { lbl.textContent = !newActive ? 'Active' : 'Inactive'; lbl.className = 'sw-label ' + (!newActive ? 'on' : 'off'); }
        if (stat) { stat.textContent = '!'; stat.className = 'cad-status err'; }
      });
  }

    // â”€â”€ Add Person page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var addPersonSaving = false;

  function initAddPersonPage() {
    resetAddPerson();
  }

  function resetAddPerson() {
    addPersonSaving = false;
    document.getElementById('addperson-form').style.display = 'block';
    document.getElementById('addperson-success').classList.remove('on');
    document.getElementById('addperson-bar').style.display = 'block';
    document.getElementById('addperson-btn').disabled = false;
    document.getElementById('addperson-btn').textContent = 'Add to Call List';
    document.getElementById('ap-name').value = '';
    document.getElementById('ap-role').value = '';
    document.getElementById('ap-fellowship').value = '';
    document.getElementById('ap-priority').value = '';
    document.getElementById('ap-cadence').value = '28';
    showAddPersonMsg('', '');
  }

  function showAddPersonMsg(text, cls) {
    var el = document.getElementById('addperson-msg');
    el.className = 'msg ' + (cls || '');
    el.textContent = text || '';
  }

  function submitAddPerson() {
    if (addPersonSaving) return;
    var name      = document.getElementById('ap-name').value.trim();
    var role      = document.getElementById('ap-role').value.trim();
    var fellowship= document.getElementById('ap-fellowship').value.trim();
    var priority  = document.getElementById('ap-priority').value.trim();
    var cadence   = parseInt(document.getElementById('ap-cadence').value) || 28;

    if (!name) { showAddPersonMsg('Full name is required.', 'error'); document.getElementById('ap-name').focus(); return; }

    addPersonSaving = true;
    var btn = document.getElementById('addperson-btn');
    btn.disabled = true;
    btn.textContent = 'Saving\u2026';
    showAddPersonMsg('Saving\u2026', 'info');

    var payload = JSON.stringify({ name: name, role: role, fellowship: fellowship, priority: priority, cadenceDays: cadence });
    apiFetch('addPerson', { payload: payload })
      .then(function(res) {
        addPersonSaving = false;
        btn.disabled = false;
        btn.textContent = 'Add to Call List';
        if (res && res.success) {
          // Bust the people cache so Log a Call picks up the new person
          peopleLoaded = false;
          document.getElementById('addperson-form').style.display = 'none';
          document.getElementById('addperson-bar').style.display = 'none';
          document.getElementById('addperson-success-name').textContent = name + ' has been added.';
          document.getElementById('addperson-success').classList.add('on');
        } else {
          var errMsg = (res && (res.error || res.message)) ? (res.error || res.message) : 'Save failed - check that your Apps Script is deployed and up to date.';
          showAddPersonMsg(errMsg, 'error');
        }
      })
      .catch(function(e) {
        addPersonSaving = false;
        btn.disabled = false;
        btn.textContent = 'Add to Call List';
        showAddPersonMsg('Error: ' + String(e), 'error');
      });
  }

  function loadGuidePagePartial() {
    var currentGuide = document.getElementById('pg-guide');
    if (!currentGuide) return Promise.resolve();
    return fetch('partials/pg-guide.html', { cache: 'no-store' })
      .then(function(resp) {
        if (!resp.ok) throw new Error('Guide partial unavailable');
        return resp.text();
      })
      .then(function(html) {
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        var incomingGuide = wrap.querySelector('#pg-guide');
        if (!incomingGuide) {
          var body = wrap.querySelector('body');
          if (body) {
            incomingGuide = document.createElement('div');
            incomingGuide.id = 'pg-guide';
            incomingGuide.className = 'page';
            wrap.querySelectorAll('style,link[rel="stylesheet"]').forEach(function(node) {
              incomingGuide.appendChild(node.cloneNode(true));
            });
            Array.prototype.slice.call(body.childNodes).forEach(function(node) {
              incomingGuide.appendChild(node.cloneNode(true));
            });
          }
        }
        if (!incomingGuide) return;
        var wasActive = currentGuide.classList.contains('active');
        if (wasActive) incomingGuide.classList.add('active');
        currentGuide.replaceWith(incomingGuide);
      })
      .catch(function() {});
  }

  window.onload = function() {
    var hash = window.location.hash.replace('#', '');
    var pageId = (hash && HASH_MAP[hash]) ? HASH_MAP[hash] : 'pg-home';
    loadGuidePagePartial().then(function() {
      showPage(pageId, false);
    }, function() {
      showPage(pageId, false);
    });
  };

  // â”€â”€ Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var analyticsData = null;
  var analyticsRange = '1m'; // '1m' or '3m'
  var roleFreqData = null;

  function loadAnalytics() {
    var el = document.getElementById('analytics-body');
    el.innerHTML = '<div class="people-loading" style="padding:40px 0"><span>Loading</span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    // Fetch main analytics first - role frequency is secondary and must never block it
    apiFetch('getAnalytics').then(function(data) {
      if (data.error) { el.innerHTML = '<div class="err-box">' + esc(data.error) + '</div>'; return; }
      analyticsData = data;
      renderAnalytics(data);
      // Now fetch role frequency independently - failures are silent
      apiFetch('getRoleFrequency').then(function(r) {
        if (r && Array.isArray(r.roles) && r.roles.length) {
          roleFreqData = r;
          // Re-render to append the role section without losing the existing view
          renderAnalytics(analyticsData);
        }
      }).catch(function(){});
    }).catch(function(e) {
      el.innerHTML = '<div class="err-box">Could not load analytics.<br><small>' + esc(String(e)) + '</small></div>';
    });
  }

  function setAnalyticsRange(range) {
    analyticsRange = range;
    if (analyticsData) renderAnalytics(analyticsData);
  }

  function renderAnalytics(data) {
    var s      = data.summary       || {};
    var wks    = data.weeksData     || [];
    var days   = data.lastWeekDays  || [];
    var silent = data.silentPeople  || [];
    var el     = document.getElementById('analytics-body');

    // â”€â”€ Range filter â”€â”€
    var numWeeks = analyticsRange === '1m' ? 4 : 12;
    var filtered = wks.slice(-numWeeks);

    // Recalculate summary stats for filtered range
    var filtTotal    = filtered.reduce(function(s,w){ return s + w.total; }, 0);
    var filtReached  = filtered.reduce(function(s,w){ return s + w.reached; }, 0);
    var filtRate     = filtTotal > 0 ? Math.round(filtReached / filtTotal * 100) : 0;

    // â”€â”€ This week stats â”€â”€
    var thisWkTotal     = s.thisWeekTotal      || 0;
    var thisWkDue       = s.thisWeekDue        || 0;
    var thisWkReached   = s.thisWeekDueReached || 0;
    var thisWkCompleted = s.completedThisWeek  || 0;

    // â”€â”€ Summary stat boxes â”€â”€
    var statsHtml =
      '<div class="an-stat-row">' +
        '<div class="an-stat-box">' +
          '<div class="an-stat-num">' + thisWkTotal + '</div>' +
          '<div class="an-stat-lbl">This Week</div>' +
          '<div class="an-stat-sub">Total calls made</div>' +
        '</div>' +
        '<div class="an-stat-box">' +
          '<div class="an-stat-num green">' + thisWkCompleted + '</div>' +
          '<div class="an-stat-lbl">Reached</div>' +
          '<div class="an-stat-sub">Completed this week</div>' +
        '</div>' +
      '</div>';

    var lastWeekHtml = ''; // removed per spec

    // â”€â”€ Range toggle â”€â”€
    var toggleHtml =
      '<div class="an-range-toggle">' +
        '<button class="an-range-btn' + (analyticsRange === '1m' ? ' active' : '') + '" onclick="setAnalyticsRange(\'1m\')">Last Month</button>' +
        '<button class="an-range-btn' + (analyticsRange === '3m' ? ' active' : '') + '" onclick="setAnalyticsRange(\'3m\')">Last 3 Months</button>' +
      '</div>';

    // â”€â”€ Line chart â”€â”€
    var chartHtml = buildLineChart(filtered, analyticsRange);

    // â”€â”€ Best week callout â”€â”€
    var bestInRange = filtered.reduce(function(b, w){ return w.reached > b.reached ? w : b; }, filtered[0] || {});
    var bestHtml = bestInRange && bestInRange.reached > 0
      ? '<div style="background:var(--accent-soft);border:1px solid rgba(36,76,67,.15);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:20px;font-size:13px;color:var(--accent);">' +
          '<strong>Best week (reached):</strong> w/c ' + esc(bestInRange.label) + ' - ' + bestInRange.reached + ' person' + (bestInRange.reached !== 1 ? 's' : '') + ' reached' +
        '</div>'
      : '';

    // â”€â”€ Silent people â”€â”€
    var silentHtml = '';
    if (silent.length) {
      silentHtml += '<div class="an-chart-card" style="border-left:3px solid var(--danger);">';
      silentHtml += '<div class="an-chart-title" style="color:var(--danger);">No Contact in 6+ Weeks <span style="font-weight:400;font-size:12px;color:var(--muted);">(' + silent.length + ' ' + (silent.length === 1 ? 'person' : 'people') + ')</span></div>';
      silent.forEach(function(p) {
        var sub = p.lastContact
          ? 'Last contact: ' + esc(p.lastContact) + (p.weeksSince ? ' (' + p.weeksSince + ' weeks ago)' : '')
          : 'No contact recorded';
        var pid = esc(p.pid || '');
        silentHtml += '<div class="an-silent-row" style="cursor:pointer;" onclick="openBsheet(\'' + pid + '\',\'' + esc(p.name) + '\')">' +
          '<div class="an-silent-av">' + esc(ini(p.name)) + '</div>' +
          '<div style="flex:1;min-width:0;"><div class="an-silent-name">' + esc(p.name) + '</div><div class="an-silent-sub">' + sub + '</div></div>' +
          '<div style="font-size:11px;font-weight:600;color:var(--accent);flex-shrink:0;padding-left:8px;">Quick Log -></div>' +
        '</div>';
      });
      silentHtml += '</div>';
    } else {
      silentHtml = '<div style="background:var(--success-bg);border:1px solid rgba(2,122,72,.15);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:20px;font-size:13px;color:var(--success);">Everyone has been contacted in the last 6 weeks.</div>';
    }

    el.innerHTML = statsHtml + lastWeekHtml + toggleHtml + chartHtml + bestHtml + silentHtml + buildRoleFrequency();
  }

  function buildRoleFrequency() {
    var roles = (roleFreqData && roleFreqData.roles) ? roleFreqData.roles : [];
    if (!roles.length) return '';

    var rows = roles.map(function(r) {
      // Colour-code the avg days: green â‰¤21, gold â‰¤42, red >42
      var col = r.avgDays <= 21 ? 'var(--success)' : r.avgDays <= 42 ? 'var(--gold)' : 'var(--danger)';
      var bar = Math.min(100, Math.round(r.avgDays / 60 * 100)); // max bar at 60 days
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(r.role) + '</div>' +
          '<div style="margin-top:5px;height:5px;background:var(--line);border-radius:99px;overflow:hidden;">' +
            '<div style="width:' + bar + '%;height:100%;background:' + col + ';border-radius:99px;"></div>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0;">' +
          '<div style="font-size:17px;font-weight:700;color:' + col + ';letter-spacing:-0.02em;">' + r.avgDays + 'd</div>' +
          '<div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">' + r.peopleCount + ' ' + (r.peopleCount === 1 ? 'person' : 'people') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="an-chart-card" style="margin-bottom:20px;">' +
      '<div class="an-chart-title">Avg Contact Frequency by Role</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:12px;">Average days between successful contacts · people with 2+ calls</div>' +
      '<div style="margin-bottom:-10px;">' + rows + '</div>' +
    '</div>';
  }

  function buildLineChart(wks, range) {
    if (!wks || !wks.length) return '<div class="hist-empty">No call data yet.</div>';

    var PAD_L = 32, PAD_R = 12, PAD_T = 20, PAD_B = 32;
    var H = 160;
    var minW = 320;
    var pointSpacing = range === '1m' ? 60 : 44;
    var svgW = Math.max(minW, PAD_L + (wks.length - 1) * pointSpacing + PAD_R);

    var maxReached = Math.max.apply(null, wks.map(function(w){ return w.reached; }));
    if (maxReached === 0) maxReached = 1;

    // Y position for a value
    function yPos(v) { return PAD_T + H - Math.round(H * v / maxReached); }

    // X position for index
    function xPos(i) { return PAD_L + i * pointSpacing; }

    // Grid lines
    var grid = '';
    var steps = Math.min(maxReached, 4);
    for (var g = 1; g <= steps; g++) {
      var gv = Math.round(maxReached * g / steps);
      var gy = yPos(gv);
      grid += '<line x1="' + PAD_L + '" y1="' + gy + '" x2="' + (svgW - PAD_R) + '" y2="' + gy + '" stroke="#e5e0d5" stroke-width="1" stroke-dasharray="3,3"/>';
      grid += '<text x="' + (PAD_L - 5) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="9" fill="#7a7870">' + gv + '</text>';
    }

    // Build polyline points
    var pts = wks.map(function(w, i){ return xPos(i) + ',' + yPos(w.reached); }).join(' ');

    // Filled area path (under the line)
    var areaPath = 'M ' + xPos(0) + ' ' + yPos(wks[0].reached);
    for (var i = 1; i < wks.length; i++) areaPath += ' L ' + xPos(i) + ' ' + yPos(wks[i].reached);
    areaPath += ' L ' + xPos(wks.length - 1) + ' ' + (PAD_T + H);
    areaPath += ' L ' + xPos(0) + ' ' + (PAD_T + H) + ' Z';

    // Find best week index
    var bestIdx = 0;
    wks.forEach(function(w, i){ if (w.reached > wks[bestIdx].reached) bestIdx = i; });

    // Dots and labels
    var dots = '';
    wks.forEach(function(w, i) {
      var x = xPos(i), y = yPos(w.reached);
      var isLast = i === wks.length - 1;
      var isBest = i === bestIdx && w.reached > 0;
      var r = (isLast || isBest) ? 5 : 3.5;
      var fill = isBest ? '#b89146' : 'var(--accent)';
      var stroke = isBest ? '#92400e' : '#244c43';
      dots += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/>';

      // Value label above dot (only show if reached > 0 or it's endpoint)
      if (w.reached > 0 || isLast) {
        dots += '<text x="' + x + '" y="' + (y - 8) + '" text-anchor="middle" font-size="10" font-weight="600" fill="' + (isBest ? '#92400e' : '#244c43') + '">' + w.reached + '</text>';
      }

      // X axis label (week start)
      var parts = w.label.split(' ');
      var shortLbl = parts.length === 2 ? parts[0].slice(0,1) + parts[1] : w.label;
      var xColor  = isLast ? '#244c43' : isBest ? '#92400e' : '#7a7870';
      var xWeight = (isLast || isBest) ? '700' : '400';
      dots += '<text x="' + x + '" y="' + (PAD_T + H + 16) + '" text-anchor="middle" font-size="9" fill="' + xColor + '" font-weight="' + xWeight + '">' + esc(shortLbl) + '</text>';
    });

    // Axes
    var axes =
      '<line x1="' + PAD_L + '" y1="' + PAD_T + '" x2="' + PAD_L + '" y2="' + (PAD_T + H) + '" stroke="#e5e0d5" stroke-width="1"/>' +
      '<line x1="' + PAD_L + '" y1="' + (PAD_T + H) + '" x2="' + (svgW - PAD_R) + '" y2="' + (PAD_T + H) + '" stroke="#e5e0d5" stroke-width="1"/>';

    var totalH = PAD_T + H + PAD_B;

    return '<div class="an-line-card">' +
      '<div class="an-line-title">People Reached per Week</div>' +
      '<div class="an-line-sub">' + (range === '1m' ? 'Last 4 weeks' : 'Last 12 weeks') + ' · best week · current week</div>' +
      '<div class="an-line-wrap">' +
        '<svg width="' + svgW + '" height="' + totalH + '" viewBox="0 0 ' + svgW + ' ' + totalH + '" xmlns="http://www.w3.org/2000/svg">' +
          grid +
          '<defs><linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#244c43" stop-opacity="0.15"/><stop offset="100%" stop-color="#244c43" stop-opacity="0"/></linearGradient></defs>' +
          '<path d="' + areaPath + '" fill="url(#lineGrad)"/>' +
          '<polyline points="' + pts + '" fill="none" stroke="#244c43" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
          dots + axes +
        '</svg>' +
      '</div>' +
    '</div>';
  }

  // â”€â”€ Pull-to-refresh on dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  (function() {
    var startY = 0, pulling = false;
    var dashEl = document.getElementById('pg-dash');
    dashEl.addEventListener('touchstart', function(e) {
      if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });
    dashEl.addEventListener('touchmove', function(e) {
      if (!pulling) return;
      var dist = e.touches[0].clientY - startY;
      if (dist > 60) { document.getElementById('ptr-bar').style.display = 'flex'; }
    }, { passive: true });
    dashEl.addEventListener('touchend', function() {
      if (!pulling) return;
      pulling = false;
      var bar = document.getElementById('ptr-bar');
      if (bar.style.display === 'flex') { bar.style.display = 'none'; loadDash(); }
    });
  })();

  // â”€â”€ Edit Person Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  var editModalPid = null;

  function openEditModal(pid) {
    var p = cadPeople.find(function(x){ return String(x.id) === String(pid); });
    if (!p) return;
    editModalPid = pid;
    document.getElementById('em-name').value       = p.name       || '';
    document.getElementById('em-role').value       = p.role       || '';
    document.getElementById('em-fellowship').value = p.fellowship || '';
    document.getElementById('em-priority').value   = p.priority   || '';
    document.getElementById('em-msg').className    = 'modal-msg';
    document.getElementById('em-msg').textContent  = '';
    document.getElementById('em-save').disabled    = false;
    document.getElementById('em-save').textContent = 'Save Changes';
    document.getElementById('edit-modal').classList.add('open');
  }

  function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('open');
    editModalPid = null;
  }

  function submitEditPerson() {
    if (!editModalPid) return;
    var name       = document.getElementById('em-name').value.trim();
    var role       = document.getElementById('em-role').value.trim();
    var fellowship = document.getElementById('em-fellowship').value.trim();
    var priority   = document.getElementById('em-priority').value.trim();
    var msg        = document.getElementById('em-msg');
    var btn        = document.getElementById('em-save');

    if (!name) { msg.textContent = 'Name is required.'; msg.className = 'modal-msg error'; return; }

    btn.disabled = true;
    btn.textContent = 'Saving...';
    msg.className = 'modal-msg';

    var payload = JSON.stringify({ personId: editModalPid, name: name, role: role, fellowship: fellowship, priority: priority });
    apiFetch('editPerson', { payload: payload })
      .then(function(res) {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
        if (res && res.success) {
          // Update local cache
          var p = cadPeople.find(function(x){ return String(x.id) === String(editModalPid); });
          if (p) { p.name = name; p.role = role; p.fellowship = fellowship; p.priority = priority; }
          cadSessionDirty = true;
          msg.textContent = 'Saved!'; msg.className = 'modal-msg ok';
          setTimeout(function() {
            closeEditModal();
            renderCadence(cadPeople);
          }, 800);
        } else {
          msg.textContent = (res && res.error) ? res.error : 'Save failed.';
          msg.className = 'modal-msg error';
        }
      })
      .catch(function(e) {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
        msg.textContent = 'Error: ' + String(e);
        msg.className = 'modal-msg error';
      });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DARK MODE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function toggleDark() {
    var isDark = document.body.classList.toggle('dark');
    try { localStorage.setItem('ct-dark', isDark ? '1' : '0'); } catch(e) {}
    document.getElementById('dark-toggle-btn').innerHTML = isDark ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="16.95" y2="7.05"/><line x1="7.05" y1="16.95" x2="4.93" y2="19.07"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
  (function() {
    try {
      var pref = localStorage.getItem('ct-dark');
      if (pref === '1') {
        document.body.classList.add('dark');
        var btn = document.getElementById('dark-toggle-btn');
        if (btn) btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="16.95" y2="7.05"/><line x1="7.05" y1="16.95" x2="4.93" y2="19.07"/></svg>';
      }
    } catch(e) {}
  })();

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // QUICK LOG BOTTOM SHEET
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
    document.getElementById('bsheet').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeBsheet() {
    document.getElementById('bsheet-backdrop').classList.remove('open');
    document.getElementById('bsheet').classList.remove('open');
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
      savePromise = apiFetch('saveInteraction', { payload: JSON.stringify(payload) });
    }
    savePromise.then(function(res) {
      bsSaving = false;
      if (res && res.success) {
        var quickTodos = aiAssist.todos || [];
        if (quickTodos.length && res.interactionId) {
          apiFetch('saveTodos', { payload: JSON.stringify({
            interactionId: res.interactionId,
            personId: bsPid,
            personName: bsName,
            todos: quickTodos.map(function(t){ return { text: t }; })
          }) }).then(function(){ if (window.loadTodos && document.getElementById('pg-todos') && document.getElementById('pg-todos').classList.contains('active')) loadTodos(); }).catch(function(){});
        }
        var todoNote = quickTodos.length ? ' ' + quickTodos.length + ' action item' + (quickTodos.length > 1 ? 's' : '') + ' added.' : '';
        bsShowMsg((res.offline ? 'Saved offline - will sync when back online.' : 'Call logged!') + todoNote, 'success');
        if (bsResult === 'Reached' && bsAction === 'None') optimisticRemoveFromDash(bsPid);
        setTimeout(function() { closeBsheet(); loadDash(); }, 260);
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

  function voiceHint(msg) {
    var now = Date.now();
    if (now - _voiceErrorShownAt < 1200) return;
    _voiceErrorShownAt = now;
    if (window.showUxToast) window.showUxToast(msg);
  }

  function toggleVoice(textareaId, micBtnId) {
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
      var btn = document.getElementById(micBtnId);
      if (btn) btn.classList.add('listening');
    };
    _recognition.onresult = function(e) {
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
        setTimeout(function() {
          if (_voiceKeepAlive && !_voiceManualStop && _activeTextareaId === textareaId && !_recognition) {
            toggleVoice(textareaId, micBtnId);
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
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // OFFLINE QUEUE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var _offlineQueue = [];
  var _syncing = false;

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
      document.getElementById('offline-q-count').textContent = qlen > 0 ? '(' + qlen + ' queued)' : '';
    }
  }

  function updateOfflineBadge() {
    document.querySelectorAll('.offline-queue-badge').forEach(function(el) {
      el.textContent = _offlineQueue.length;
      el.classList.toggle('on', _offlineQueue.length > 0);
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
    var idx = 0;
    function next() {
      if (idx >= queue.length) {
        _syncing = false;
        // remove synced items
        var remaining = _offlineQueue.filter(function(item) {
          return !queue.slice(0, idx).some(function(q) { return q._queuedAt === item._queuedAt; });
        });
        _offlineQueue = remaining;
        try { localStorage.setItem('ct-offline-queue', JSON.stringify(_offlineQueue)); } catch(e) {}
        updateOfflineBadge();
        if (idx > 0) loadDash();
        return;
      }
      var queued = queue[idx];
      var payload = Object.assign({}, queued);
      var queuedTodos = Array.isArray(queued._queuedTodos) ? queued._queuedTodos : [];
      delete payload._queuedAt;
      delete payload._queuedTodos;
      apiFetch('saveInteraction', { payload: JSON.stringify(payload) })
        .then(function(res) {
          if (!queuedTodos.length) { idx++; next(); return; }
          var interactionId = (res && (res.interactionId || res.interactionID || res.id)) || ('offline-' + Date.now());
          apiFetch('saveTodos', { payload: JSON.stringify({
            interactionId: interactionId,
            personId: payload.personId,
            personName: payload.fullName || '',
            todos: queuedTodos.map(function(t){
              if (t && typeof t === 'object') {
                return { text: String(t.text || ''), dueDate: String(t.dueDate || '') };
              }
              return { text: String(t || ''), dueDate: '' };
            }).filter(function(t){ return String(t.text || '').trim(); })
          }) }).then(function(){ idx++; next(); }).catch(function(){ idx++; next(); });
        })
        .catch(function() { _syncing = false; }); // stop on error, retry next time
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
  var _notesPid = null;

  function openNotesModal(pid, name) {
    _notesPid = pid;
    document.getElementById('notes-modal-title').textContent = name;
    document.getElementById('notes-modal-sub').textContent = 'Persistent notes about ' + name;
    document.getElementById('notes-modal-msg').className = 'modal-msg';
    document.getElementById('notes-modal-msg').textContent = '';
    document.getElementById('notes-modal-ta').value = 'Loading...';
    document.getElementById('notes-modal-ta').disabled = true;
    document.getElementById('notes-save-btn').disabled = true;
    document.getElementById('notes-modal').classList.add('open');
    apiFetch('getPersonNotes', { personId: pid }).then(function(res) {
      document.getElementById('notes-modal-ta').value = (res && res.notes) ? res.notes : '';
      document.getElementById('notes-modal-ta').disabled = false;
      document.getElementById('notes-save-btn').disabled = false;
    }).catch(function() {
      document.getElementById('notes-modal-ta').value = '';
      document.getElementById('notes-modal-ta').disabled = false;
      document.getElementById('notes-save-btn').disabled = false;
    });
  }

  function closeNotesModal() {
    document.getElementById('notes-modal').classList.remove('open');
    stopVoice();
    _notesPid = null;
  }

  function savePersonNotes() {
    if (!_notesPid) return;
    var notes = document.getElementById('notes-modal-ta').value;
    var btn = document.getElementById('notes-save-btn');
    var msg = document.getElementById('notes-modal-msg');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    msg.className = 'modal-msg';
    apiFetch('savePersonNotes', { payload: JSON.stringify({ personId: _notesPid, notes: notes }) })
      .then(function(res) {
        btn.disabled = false; btn.textContent = 'Save Notes';
        if (res && res.success) {
          msg.textContent = 'Notes saved.'; msg.className = 'modal-msg ok';
          setTimeout(function() { msg.className = 'modal-msg'; }, 2500);
        } else {
          msg.textContent = res && res.error ? res.error : 'Save failed.'; msg.className = 'modal-msg error';
        }
      }).catch(function(e) {
        btn.disabled = false; btn.textContent = 'Save Notes';
        msg.textContent = 'Error: ' + String(e); msg.className = 'modal-msg error';
      });
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SEARCH ACROSS ALL INTERACTIONS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var _searchTimer = null;

  function onSearchInput() {
    clearTimeout(_searchTimer);
    var q = document.getElementById('search-page-input').value.trim();
    if (q.length < 2) {
      document.getElementById('search-results-area').innerHTML =
        '<div class="search-empty"><div style="font-size:24px;font-weight:700;margin-bottom:8px;">Search</div>Search across all call notes, names, and results.</div>';
      return;
    }
    _searchTimer = setTimeout(doSearch, 400);
  }

  function doSearch() {
    var q = document.getElementById('search-page-input').value.trim();
    if (q.length < 2) return;
    var area = document.getElementById('search-results-area');
    area.innerHTML = '<div class="search-empty"><div style="font-size:24px;font-weight:700;margin-bottom:8px;">Search</div>Searching...</div>';
    apiFetch('searchInteractions', { query: q }).then(function(data) {
      var results = data && data.results ? data.results : [];
      if (!results.length) {
        area.innerHTML = '<div class="search-empty"><div style="font-size:24px;font-weight:700;margin-bottom:8px;">Search</div>No results for "<strong>' + esc(q) + '</strong>"</div>';
        return;
      }
      var total = data.total || results.length;
      var h = '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">' + results.length + (total > results.length ? ' of ' + total : '') + ' result' + (total !== 1 ? 's' : '') + '</div>';
      results.forEach(function(r) {
        var badgeCls = r.outcome === 'Successful' ? 'rb-reached'
          : r.result === 'Left Message'     ? 'rb-message'
          : r.result === 'Rescheduled Call' ? 'rb-resched'
          : 'rb-attempt';
        h += '<div class="search-result-card" onclick="goHistoryPerson(\'' + esc(r.personId) + '\')">';
        h += '<div class="search-result-name">' + esc(r.personName) + '</div>';
        h += '<div class="search-result-meta"><span class="search-result-date">' + esc(r.timestamp) + '</span>';
        h += '<span class="search-result-badge ' + badgeCls + '">' + esc(r.result || r.outcome) + '</span></div>';
        if (r.summary) h += '<div class="search-result-text">' + highlightMatch(esc(r.summary), esc(q)) + '</div>';
        if (r.nextAction && r.nextAction !== 'None') h += '<div class="search-result-text" style="margin-top:3px;font-size:12px;color:var(--muted);">Next: ' + esc(r.nextAction) + '</div>';
        h += '</div>';
      });
      area.innerHTML = h;
    }).catch(function(e) {
      area.innerHTML = '<div class="search-empty" style="color:var(--danger);">Search error: ' + esc(String(e)) + '</div>';
    });
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    var re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return text.replace(re, '<mark class="search-highlight">$1</mark>');
  }

  // Add search page initialisation handled in showPage above

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // AI LOG ASSISTANT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var _aiParsed = null;       // holds last parsed result
  var _aiPeopleCache = null;  // local copy of people for override search

  function openAiAssist() {
    _aiParsed = null;
    document.getElementById('ai-input').value = '';
    document.getElementById('ai-input-msg').className = 'msg';
    document.getElementById('ai-parse-btn').disabled = false;
    document.getElementById('ai-parse-btn').textContent = '↻ Parse';
    aiShowStep('input');
    document.getElementById('ai-backdrop').classList.add('open');
    document.getElementById('ai-bsheet').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function() { document.getElementById('ai-input').focus(); }, 200);
  }

  function closeAiAssist() {
    document.getElementById('ai-backdrop').classList.remove('open');
    document.getElementById('ai-bsheet').classList.remove('open');
    document.body.style.overflow = '';
    stopVoice();
  }

  function aiShowStep(step) {
    ['input','confirm','success'].forEach(function(s) {
      document.getElementById('ai-step-' + s).style.display = s === step ? 'block' : 'none';
    });
  }

  function aiGoBack() {
    aiShowStep('input');
    _aiParsed = null;
  }

  function runAiParse() {
    var desc = document.getElementById('ai-input').value.trim();
    if (!desc) {
      var msg = document.getElementById('ai-input-msg');
      msg.textContent = 'Please describe the call first.'; msg.className = 'msg error'; return;
    }
    stopVoice();
    var btn = document.getElementById('ai-parse-btn');
    btn.disabled = true; btn.textContent = '⏳ Parsing...';
    document.getElementById('ai-input-msg').className = 'msg';

    // â”€â”€ Client-side parsing with chrono-node (no API key needed) â”€â”€
    // Reuse the already-loaded allPeople list if available - avoids a second fetch
    var peoplePromise = (allPeople && allPeople.length)
      ? Promise.resolve(allPeople)
      : (_aiPeopleCache && _aiPeopleCache.length)
        ? Promise.resolve(_aiPeopleCache)
        : apiFetch('people').then(function(list) { _aiPeopleCache = list; return list; });

    peoplePromise.then(function(people) {
      _aiPeopleCache = people;
      var lower = desc.toLowerCase();

      // â”€â”€ Result detection â”€â”€
      // IMPORTANT: check no-answer negations FIRST to avoid false positives
      // e.g. "called ella, she didn't pick up" must NOT trigger calledAndPattern
      var result = 'No Answer';
      var noAnswerPattern = /(voicemail|left a message|left message|left them a message|went to voicemail|no answer|didn.t pick|did not pick|didn.t answer|did not answer|not available|couldn.t reach|could not reach|no response|never answered|never picked|didn.t get through|did not get through)/;
      var reachedPattern = /(spoke|talked|chatted|connected|reached|answered|picked up|pick up|she picked|he picked|they picked|caught up|had a call|had a chat|had a conversation|great call|good call|nice call|quick call|long call|good chat|great chat|nice chat|she said|he said|they said|she told|he told|they told|she mentioned|he mentioned|they mentioned|she.s |he.s |they.re |she is |he is |she was |he was |she has |he has |graduating|told me|let me know|shared|mentioned|praying|discussed|talked about|spoke about|we talked|we spoke|we chatted|we discussed)/;
      // Also catch "called X, she/he/they ..." - comma or "and" after name implies conversation
      var calledAndPattern = /called .{1,40}[,]\s*(she|he|they|we)\b/;
      var calledNameAndPattern = /called .{1,40} and (she|he|they|we)\b/;
      if (noAnswerPattern.test(lower)) {
        result = /voicemail|left.*message/.test(lower) ? 'Left Message' : 'No Answer';
      } else if (reachedPattern.test(lower) || calledAndPattern.test(lower) || calledNameAndPattern.test(lower)) {
        result = 'Reached';
      } else if (/(reschedul|moved the call|call moved|postponed)/.test(lower)) {
        result = 'Rescheduled Call';
      }

      // â”€â”€ Next action detection â”€â”€
      var nextAction = 'None';
      if (/(call back|call them back|call him back|call her back|ring back|ring them|callback|they.ll call|they will call|will call me|calling me back|she.ll call|he.ll call|will phone|will ring)/.test(lower)) {
        nextAction = 'Callback';
      } else if (/(follow.?up|check in|check on|check back|will send|will pray|will visit|will text|will try|try again|try her|try him|try them|need to send|need to pray|going to send|going to pray|going to visit|going to try|reach out|touch base|connect again|catch up|reconnect|will call|call again|call next|calling next|ping|in \d+ day|in \d+ week|in \d+ month|next week|next month|next monday|next tuesday|next wednesday|next thursday|next friday|next saturday|next sunday|tomorrow|this week|this friday|this monday|in a week|in a month|in a few|a few days|a few weeks)/.test(lower)) {
        nextAction = 'Follow-up';
      }

      // â”€â”€ Date parsing with chrono-node - runs always, not gated on nextAction â”€â”€
      var nextActionDateTime = null;
      if (typeof chrono !== 'undefined') {
        var parsedDate = chrono.parseDate(desc, new Date(), { forwardDate: true });
        if (parsedDate) {
          nextActionDateTime = parsedDate.toISOString();
          // If a future date was found but action still None, infer Follow-up
          if (nextAction === 'None') nextAction = 'Follow-up';
        }
      }

      // â”€â”€ Summary: always use the description so notes are never blank â”€â”€
      var summary = desc;

      // â”€â”€ Person matching: first name OR full name, case-insensitive â”€â”€
      var personId = '';
      var personName = '';
      var bestScore = 0;
      people.forEach(function(p) {
        var nameLower = p.name.toLowerCase();
        var parts = nameLower.split(/\s+/);
        var score = 0;
        parts.forEach(function(part) {
          if (part.length > 1 && lower.indexOf(part) >= 0) score++;
        });
        // First name alone is enough
        if (parts[0] && parts[0].length > 1 && lower.indexOf(parts[0]) >= 0) score += 0.5;
        if (score > bestScore) { bestScore = score; personId = p.id; personName = p.name; }
      });
      if (bestScore === 0) { personId = ''; personName = ''; }

      _aiParsed = { personId: personId, personName: personName, result: result, nextAction: nextAction, nextActionDateTime: nextActionDateTime, summary: summary };
      btn.disabled = false; btn.textContent = '↻ Parse';
      showAiConfirm(_aiParsed, people);
    }).catch(function(e) {
      btn.disabled = false; btn.textContent = '↻ Parse';
      var msg = document.getElementById('ai-input-msg');
      msg.textContent = 'Error: ' + String(e); msg.className = 'msg error';
    });
  }

  function showAiConfirm(parsed, people) {
    // Render avatar
    var name = parsed.personName || '?';
    document.getElementById('ai-conf-av').textContent = ini(name);
    document.getElementById('ai-conf-name').textContent = name;

    var matchEl = document.getElementById('ai-conf-match');
    var overEl  = document.getElementById('ai-person-override');
    if (parsed.personId) {
      matchEl.textContent = 'Matched in contacts';
      matchEl.style.color = 'var(--success)';
      overEl.style.display = 'none';
    } else {
      matchEl.textContent = 'Not found in contacts';
      matchEl.style.color = 'var(--danger)';
      overEl.style.display = 'block';
      document.getElementById('ai-override-search').value = name;
      aiOverrideSearch();
    }

    // Result chips
    document.querySelectorAll('#ai-result-chips .ai-rc').forEach(function(btn) {
      btn.className = 'ai-rc';
      if (btn.getAttribute('data-r') === parsed.result) {
        var cls = parsed.result === 'Reached' ? 'sel-reached' : parsed.result === 'No Answer' ? 'sel-noanswer' : parsed.result === 'Left Message' ? 'sel-message' : 'sel-resched';
        btn.className = 'ai-rc ' + cls;
      }
    });

    // Next action chips
    document.querySelectorAll('#ai-action-chips .ai-rc').forEach(function(btn) {
      btn.className = 'ai-rc';
      if (btn.getAttribute('data-a') === (parsed.nextAction || 'None')) btn.className = 'ai-rc sel-action';
    });

    // Date
    var dateRow = document.getElementById('ai-conf-date-row');
    if (parsed.nextActionDateTime) {
      dateRow.style.display = 'block';
      try {
        var d = new Date(parsed.nextActionDateTime);
        document.getElementById('ai-conf-date').textContent =
          d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
      } catch(e) {
        document.getElementById('ai-conf-date').textContent = parsed.nextActionDateTime;
      }
    } else {
      dateRow.style.display = 'none';
    }

    // Summary (textarea)
    var sumRow = document.getElementById('ai-conf-summary-row');
    sumRow.style.display = 'block';
    document.getElementById('ai-conf-summary').value = parsed.summary || '';

    document.getElementById('ai-confirm-msg').className = 'msg';
    document.getElementById('ai-confirm-btn').disabled = false;
    document.getElementById('ai-confirm-btn').textContent = 'Log This Call';
    aiShowStep('confirm');
  }

  function aiOverrideSearch() {
    var q = document.getElementById('ai-override-search').value.trim().toLowerCase();
    var people = _aiPeopleCache || [];
    var filtered = q ? people.filter(function(p) { return p.name.toLowerCase().indexOf(q) >= 0; }).slice(0,6) : people.slice(0,6);
    var drop = document.getElementById('ai-override-drop');
    if (!filtered.length) { drop.style.display = 'none'; return; }
    drop.style.display = 'block';
    drop.innerHTML = filtered.map(function(p) {
      return '<div style="padding:10px 14px;border-bottom:1px solid var(--line);cursor:pointer;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;" onmousedown="aiSelectPerson(\'' + esc(p.id) + '\',\'' + esc(p.name) + '\')">' +
        '<div style="width:24px;height:24px;border-radius:5px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;">' + esc(ini(p.name)) + '</div>' +
        esc(p.name) + '</div>';
    }).join('');
  }

  function aiSelectPerson(id, name) {
    if (_aiParsed) {
      _aiParsed.personId   = id;
      _aiParsed.personName = name;
    }
    document.getElementById('ai-conf-av').textContent = ini(name);
    document.getElementById('ai-conf-name').textContent = name;
    var matchEl = document.getElementById('ai-conf-match');
    matchEl.textContent = 'Matched: ' + name;
    matchEl.style.color = 'var(--success)';
    document.getElementById('ai-override-drop').style.display = 'none';
    document.getElementById('ai-override-search').value = name;
    document.getElementById('ai-person-override').style.display = 'none';
  }

  function aiPickResult(btn) {
    var r = btn.getAttribute('data-r');
    if (_aiParsed) _aiParsed.result = r;
    document.querySelectorAll('#ai-result-chips .ai-rc').forEach(function(b) { b.className = 'ai-rc'; });
    var cls = r === 'Reached' ? 'sel-reached' : r === 'No Answer' ? 'sel-noanswer' : r === 'Left Message' ? 'sel-message' : 'sel-resched';
    btn.className = 'ai-rc ' + cls;
  }

  function aiPickAction(btn) {
    var a = btn.getAttribute('data-a');
    if (_aiParsed) _aiParsed.nextAction = a;
    document.querySelectorAll('#ai-action-chips .ai-rc').forEach(function(b) { b.className = 'ai-rc'; });
    btn.className = 'ai-rc sel-action';
    // Show date row if follow-up/callback
    var dateRow = document.getElementById('ai-conf-date-row');
    if (a === 'Callback' || a === 'Follow-up') dateRow.style.display = 'block';
    else { dateRow.style.display = 'none'; if (_aiParsed) _aiParsed.nextActionDateTime = null; }
  }

  function confirmAiLog() {
    if (!_aiParsed) return;
    var p = _aiParsed;
    if (!p.personId) {
      var msg = document.getElementById('ai-confirm-msg');
      msg.textContent = 'Please select a person from the list above.'; msg.className = 'msg error'; return;
    }
    var validResults = ['Reached','No Answer','Left Message','Rescheduled Call'];
    if (!p.result || validResults.indexOf(p.result) < 0) {
      var msg2 = document.getElementById('ai-confirm-msg');
      msg2.textContent = 'Result "' + (p.result||'') + '" is not valid. Go back and be more specific.'; msg2.className = 'msg error'; return;
    }
    var btn = document.getElementById('ai-confirm-btn');
    btn.disabled = true; btn.textContent = 'Saving...';

    var payload = {
      personId:            p.personId,
      fullName:            p.personName,
      result:              p.result,
      nextAction:          p.nextAction || 'None',
      summary:             p.summary   || '',
      nextActionDateTime:  p.nextActionDateTime || null
    };

    var savePromise = !navigator.onLine
      ? (queueOfflineCall(payload), Promise.resolve({ success:true, offline:true }))
      : apiFetch('saveInteraction', { payload: JSON.stringify(payload) });

    savePromise.then(function(res) {
      if (res && res.success) {
        // Extract action items from summary text and save as todos
        var aiTodos = extractTodosFromText(p.summary || '');
        if (aiTodos.length && res.interactionId) {
          apiFetch('saveTodos', { payload: JSON.stringify({
            interactionId: res.interactionId,
            personId: p.personId,
            personName: p.personName,
            todos: aiTodos.map(function(t){ return { text: t }; })
          }) }).then(function(){ loadTodos && loadTodos(); }).catch(function(){});
        }
        var todoNote = aiTodos.length ? ' ' + aiTodos.length + ' action item' + (aiTodos.length > 1 ? 's' : '') + ' added.' : '';
        document.getElementById('ai-success-sub').textContent =
          (res.offline ? 'Saved offline - ' : 'Call with ') + p.personName +
          (res.offline ? ' will sync when reconnected.' : ' has been logged.') + todoNote;
        aiShowStep('success');
      } else {
        btn.disabled = false; btn.textContent = 'Log This Call';
        var msg = document.getElementById('ai-confirm-msg');
        msg.textContent = 'Save failed: ' + (res && res.error ? res.error : 'Unknown'); msg.className = 'msg error';
      }
    }).catch(function(e) {
      btn.disabled = false; btn.textContent = 'Log This Call';
      var msg = document.getElementById('ai-confirm-msg');
      msg.textContent = 'Error: ' + String(e); msg.className = 'msg error';
    });
  }

  // Extract actionable todo items from freeform call notes
  function extractTodosFromText(text) {
    if (!text || text.length < 6) return [];
    var todos = [];
    var lower = text.toLowerCase();
    // Pattern: sentences containing action-intent phrases
    var actionPhrases = [
      /(will|need to|going to|plan to|should|must|have to|want to)\s+(send|call|email|pray|visit|check|follow|reach|connect|text|schedule|set up|look into|share|bring|remind|help|meet|write|prepare)/,
      /(send|email|pray for|visit|check on|follow up|reach out|connect with|text|schedule|set up|remind)/,
      /(action|todo|to-do|to do|action item|next step)/
    ];
    // Split on sentence boundaries and filter for actionable ones
    var sentences = text.replace(/([.!?])\s+/g, '$1|').split('|');
    sentences.forEach(function(s) {
      s = s.trim();
      if (s.length < 8 || s.length > 160) return;
      var sl = s.toLowerCase();
      var isAction = actionPhrases.some(function(re){ return re.test(sl); });
      if (isAction && todos.indexOf(s) < 0) todos.push(s);
    });
    return todos.slice(0, 5); // cap at 5
  }

  function inferAssistFromText(text) {
    var summary = (text || '').trim();
    if (!summary) return { nextAction: 'None', nextActionDateTime: null, todos: [] };
    var lower = summary.toLowerCase();
    var nextAction = 'None';
    if (/\b(call back|callback|ring back|phone back|they will call|she will call|he will call)\b/.test(lower)) {
      nextAction = 'Callback';
    } else if (/\b(follow up|follow-up|check in|check on|reach out|connect again|touch base|send|text|email|pray|visit|remind|next week|tomorrow|in \d+ (day|days|week|weeks|month|months))\b/.test(lower)) {
      nextAction = 'Follow-up';
    }
    var nextActionDateTime = null;
    if (typeof chrono !== 'undefined' && chrono.parseDate) {
      try {
        var parsed = chrono.parseDate(summary, new Date(), { forwardDate: true });
        if (parsed) {
          nextActionDateTime = parsed.toISOString();
          if (nextAction === 'None') nextAction = 'Follow-up';
        }
      } catch(e) {}
    }
    return {
      nextAction: nextAction,
      nextActionDateTime: nextActionDateTime,
      todos: extractTodosFromText(summary)
    };
  }

