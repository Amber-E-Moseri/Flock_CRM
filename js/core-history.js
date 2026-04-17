  window.Flock = window.Flock || {};
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
      return '<div class="' + rowCls + ' js-hist-person" data-pid="' + pid + '" data-name="' + esc(p.name) + '">' +
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
        '<button class="hist-inline-log-btn js-hist-log" data-pid="' + esc(pid) + '" data-name="' + esc(name) + '" title="Log call for ' + esc(name) + '" aria-label="Log call for ' + esc(name) + '">' +
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
    }).catch(function(e) {
      panel.innerHTML = '<div class="hist-inline-empty">Could not load history.</div>';
      console.warn('[Flock]', e);
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
    }).catch(function(e) {
      document.getElementById('notes-modal-ta').value = '';
      document.getElementById('notes-modal-ta').disabled = false;
      document.getElementById('notes-save-btn').disabled = false;
      console.warn('[Flock]', e);
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
    apiPost('savePersonNotes', { payload: { personId: _notesPid, notes: notes } })
      .then(function(res) {
        btn.disabled = false; btn.textContent = 'Save Notes';
        if (res && res.success) {
          hapticTick_();
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
        h += '<div class="search-result-card" data-action="go-history-person" data-pid="' + esc(r.personId) + '">';
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

