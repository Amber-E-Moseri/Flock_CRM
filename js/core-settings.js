  window.Flock = window.Flock || {};
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
              '<button class="aset-save" id="assave-' + k + '" data-action="save-app-setting" data-key="' + k + '">Save</button>' +
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
    }).catch(function(e){ console.warn('[Flock]', e); });
  }

  function saveYourName() {
    var inp  = document.getElementById("settings-your-name");
    var btn  = document.getElementById("your-name-btn");
    var stat = document.getElementById("your-name-status");
    if (!inp) return;
    var val = inp.value.trim();
    if (!val) { if (stat) { stat.textContent = "Please enter a name."; stat.style.color = "var(--danger)"; } return; }
    btn.disabled = true; btn.textContent = "...";
    apiPost("saveSetting", { key: "YOUR_NAME", val: val }).then(function(res) {
      btn.disabled = false; btn.textContent = "Save";
      if (res && res.success) {
        hapticTick_();
        window._userName = val;
        var greetEl = document.getElementById("home-greeting");
        if (greetEl) { greetEl.textContent = getGreeting_() + ", " + val + "."; }
        if (stat) { stat.textContent = "Saved!"; stat.style.color = "var(--success)"; setTimeout(function(){ stat.textContent = ""; }, 2500); }
      } else {
        if (stat) { stat.textContent = "Error saving."; stat.style.color = "var(--danger)"; }
      }
    }).catch(function(e) {
      btn.disabled = false; btn.textContent = "Save";
      if (stat) { stat.textContent = "Error saving."; stat.style.color = "var(--danger)"; }
      console.warn('[Flock]', e);
    });
  }

  function saveAppSetting(key) {
    var inp  = document.getElementById('aset-' + key);
    var btn  = document.getElementById('assave-' + key);
    var stat = document.getElementById('asstat-' + key);
    if (!inp) return;
    var val = inp.value;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    apiPost('saveSetting', { key: key, val: val }).then(function(res) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      if (res && res.success) {
        hapticTick_();
        if (key === 'YOUR_NAME') {
          window._userName = val.trim() || ''; // update cache immediately
          // Also update the greeting on the home screen right now if it exists
          var greetEl = document.getElementById('home-greeting');
          if (greetEl) {
            var gr = getGreeting_();
            greetEl.textContent = window._userName ? gr + ', ' + window._userName + '.' : gr + '.';
          }
        }
        if (stat) { stat.textContent = 'OK'; stat.className = 'aset-status ok'; setTimeout(function(){ stat.textContent = ''; }, 2000); }
      } else {
        if (stat) { stat.textContent = '!'; stat.className = 'aset-status err'; }
      }
    }).catch(function(e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      if (stat) { stat.textContent = '!'; stat.className = 'aset-status err'; }
      console.warn('[Flock]', e);
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
          '<button class="cad-save" id="csave-' + pid + '" data-action="save-cad" data-pid="' + pid + '">Save</button>' +
          '<span class="cad-status" id="cstat-' + pid + '"></span>' +
          '<button class="cad-edit" data-action="open-edit-modal" data-pid="' + pid + '" title="Edit" style="margin-left:auto;">Edit</button>' +
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
    apiPost('saveCadence', { personId: pid, cadenceDays: days })
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
      .catch(function(e) {
        btn.disabled = false;
        btn.textContent = 'Save';
        if (stat) { stat.textContent = '!'; stat.className = 'cad-status err'; }
        console.warn('[Flock]', e);
      });
  }

  function toggleActive(pid) {
    var chk  = document.getElementById('ctog-' + pid);
    var lbl  = document.getElementById('clab-' + pid);
    var stat = document.getElementById('cstat-' + pid);
    if (!chk) return;
    var newActive = chk.checked;
    if (!newActive) {
      var ok = window.confirm('Set this person to inactive? They will be hidden from call queues until reactivated.');
      if (!ok) {
        chk.checked = true;
        if (lbl) { lbl.textContent = 'Active'; lbl.className = 'sw-label on'; }
        return;
      }
    }
    chk.disabled = true;
    apiPost('setActive', { personId: pid, active: newActive ? 'true' : 'false' })
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
      .catch(function(e) {
        chk.disabled = false;
        chk.checked = !newActive;
        if (lbl) { lbl.textContent = !newActive ? 'Active' : 'Inactive'; lbl.className = 'sw-label ' + (!newActive ? 'on' : 'off'); }
        if (stat) { stat.textContent = '!'; stat.className = 'cad-status err'; }
        console.warn('[Flock]', e);
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

    var payload = { name: name, role: role, fellowship: fellowship, priority: priority, cadenceDays: cadence };
    apiPost('addPerson', { payload: payload })
      .then(function(res) {
        addPersonSaving = false;
        btn.disabled = false;
        btn.textContent = 'Add to Call List';
        if (res && res.success) {
          // Bust the people cache so Log a Call picks up the new person
          invalidatePeopleCache();
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
      .catch(function(e) { console.warn('[Flock]', e); });
  }

  window.onload = function() {
    var hash = window.location.hash.replace('#', '');
    var pageId = (hash && HASH_MAP[hash]) ? HASH_MAP[hash] : 'pg-home';
    initBottomSheetSwipe_();
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


