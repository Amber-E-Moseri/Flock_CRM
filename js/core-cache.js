  window.Flock = window.Flock || {};
  function loadHome() {
    var gr = getGreeting_();
    // Use cached name if available, else fetch from settings
    if (window._userName) {
      document.getElementById('home-greeting').textContent = gr + ', ' + window._userName + '.';
    } else {
      apiFetch('getSettings').then(function(settings) {
        var nameEntry = Array.isArray(settings) && settings.find(function(s){ return s.key === 'YOUR_NAME'; });
        window._userName = (nameEntry && nameEntry.val) ? nameEntry.val : '';
        document.getElementById('home-greeting').textContent = gr + ', ' + window._userName + '.';
      }).catch(function(e){
        document.getElementById('home-greeting').textContent = gr + '.';
        console.warn('[Flock]', e);
      });
    }
    var now = Date.now();
    if (_homeQuickStatsCache && (now - _homeQuickStatsCache.ts) < 45000) {
      var c = _homeQuickStatsCache.data || {};
      document.getElementById('h-cb').textContent = c.callbacks || 0;
      document.getElementById('h-ov').textContent = c.overdue || 0;
      document.getElementById('h-td').textContent = c.today || 0;
      return;
    }
    apiFetch('quickStats').then(function(d){
      _homeQuickStatsCache = { ts: Date.now(), data: d || {} };
      document.getElementById('h-cb').textContent = d.callbacks || 0;
      document.getElementById('h-ov').textContent = d.overdue || 0;
      document.getElementById('h-td').textContent = d.today || 0;
    }).catch(function(e){ console.warn('[Flock]', e); });
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
  function escRe_(s){ return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function renderSection(sec, people) {
    var arr = Array.isArray(people) ? people : [];
    var h = '<div class="section" id="' + sec.id + '">';
    h += '<div class="sec-head"><span class="sec-pip ' + sec.pip + '"></span><span class="sec-title2">' + esc(sec.label) + '</span><span class="sec-badge ' + sec.badge + '">' + arr.length + '</span></div>';
    if (!arr.length) {
      var emptyCopy = 'No calls in this section right now.';
      if (sec.key === 'callbacks') emptyCopy = 'No callbacks waiting right now.';
      else if (sec.key === 'overdue') emptyCopy = 'No calls overdue - you are all caught up.';
      else if (sec.key === 'today') emptyCopy = 'No calls due today - you are on track.';
      h += '<div class="empty-row">' + esc(emptyCopy) + '</div>';
    } else arr.forEach(function(p){
      var pid = esc(p.id);
      h += '<div class="person-row ' + sec.row + ' js-dash-open" data-pid="' + pid + '" data-name="' + esc(p.name || '') + '" data-sec="' + sec.id + '">';
      h += '<div class="av ' + sec.av + '">' + esc(ini(p.name)) + '</div>';
      h += '<div class="row-info"><div class="row-name">' + esc(p.name || 'Unnamed') + '</div>';
      h += '<div class="row-meta"><span class="row-when">' + esc(sec.when(p)) + '</span>';
      if (p.priority) h += '<span class="row-pill">' + esc(p.priority) + '</span>';
      if (p.lastAttempt) h += '<span class="row-pill">Last: ' + esc(p.lastAttempt) + '</span>';
      h += '</div></div>';
      h += '<button class="log-btn js-dash-log" data-pid="' + pid + '" data-name="' + esc(p.name || '') + '" >Log</button>';
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
  var _duePeoplePromise = null;
  var _todayCountPromise = null;
  var _postSaveRefreshPromise = null;
  var _postSaveRefreshAt = 0;

  function applyDashTodayCount(today) {
    var el = document.getElementById('dash-today-count');
    if (!el) return;
    var n = Number(today && today.count) || 0;
    el.textContent = n + (n === 1 ? ' call logged today' : ' calls logged today');
  }

  function applyHomeQuickStatsFromDue_(due) {
    var data = due || {};
    var stats = {
      callbacks: (data.callbacks || []).length,
      overdue: (data.overdue || []).length,
      today: (data.today || []).length
    };
    _homeQuickStatsCache = { ts: Date.now(), data: stats };
    var cb = document.getElementById('h-cb');
    var ov = document.getElementById('h-ov');
    var td = document.getElementById('h-td');
    if (cb) cb.textContent = stats.callbacks;
    if (ov) ov.textContent = stats.overdue;
    if (td) td.textContent = stats.today;
  }

  function refreshDuePeople() {
    if (_duePeoplePromise) return _duePeoplePromise;
    _duePeoplePromise = apiFetch('duePeople')
      .then(function(due) {
        _dashDueSnapshot = due || {};
        applyHomeQuickStatsFromDue_(_dashDueSnapshot);
        if (document.getElementById('pg-dash') && document.getElementById('pg-dash').classList.contains('active')) {
          renderDash(_dashDueSnapshot);
        }
        return _dashDueSnapshot;
      })
      .finally(function() {
        _duePeoplePromise = null;
      });
    return _duePeoplePromise;
  }

  function refreshTodayCount() {
    if (_todayCountPromise) return _todayCountPromise;
    _todayCountPromise = apiFetch('getTodayCount')
      .then(function(today) {
        _dashTodaySnapshot = today || {};
        applyDashTodayCount(_dashTodaySnapshot);
        if (window.__todayLoggedCount != null && _dashTodaySnapshot && _dashTodaySnapshot.count != null) {
          window.__todayLoggedCount = Number(_dashTodaySnapshot.count) || 0;
        }
        return _dashTodaySnapshot;
      })
      .finally(function() {
        _todayCountPromise = null;
      });
    return _todayCountPromise;
  }

  function runPostSaveRefresh() {
    var now = Date.now();
    if (_postSaveRefreshPromise && (now - _postSaveRefreshAt) < 3000) return _postSaveRefreshPromise;
    _postSaveRefreshAt = now;
    _postSaveRefreshPromise = Promise.all([
      refreshTodayCount(),
      refreshDuePeople()
    ]).finally(function() {
      _postSaveRefreshPromise = null;
    });
    return _postSaveRefreshPromise;
  }
  window.runPostSaveRefresh = runPostSaveRefresh;
  window.refreshTodayCount = refreshTodayCount;
  window.refreshDuePeople = refreshDuePeople;

  function loadDash() {
    var seq = ++_dashLoadSeq;
    var refreshBtn = document.getElementById('dash-refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('loading');
    if (_dashDueSnapshot) renderDash(_dashDueSnapshot);
    else showDashLoading();
    if (_dashTodaySnapshot) applyDashTodayCount(_dashTodaySnapshot);

    refreshDuePeople()
      .then(function(due){
        if (seq !== _dashLoadSeq) return;
        _dashDueSnapshot = due || _dashDueSnapshot || {};
        if (_dashDueSnapshot) renderDash(_dashDueSnapshot);
        if (refreshBtn) refreshBtn.classList.remove('loading');
      })
      .catch(function(e){
        if (seq !== _dashLoadSeq) return;
        document.getElementById('dash-body').innerHTML = '<div class="err-box">Could not load data. Try refreshing.<br><small>' + esc(String(e)) + '</small></div>';
        if (refreshBtn) refreshBtn.classList.remove('loading');
      });

    refreshTodayCount()
      .then(function(today){
        if (seq !== _dashLoadSeq) return;
        _dashTodaySnapshot = today || _dashTodaySnapshot || {};
        if (_dashTodaySnapshot) applyDashTodayCount(_dashTodaySnapshot);
      })
      .catch(function(e){ console.warn('[Flock]', e); });
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


