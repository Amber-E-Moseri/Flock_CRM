  window.Flock = window.Flock || {};
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
      }).catch(function(e){ console.warn('[Flock]', e); });
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
        '<button class="an-range-btn' + (analyticsRange === '1m' ? ' active' : '') + '" data-action="set-analytics-range" data-range="1m">Last Month</button>' +
        '<button class="an-range-btn' + (analyticsRange === '3m' ? ' active' : '') + '" data-action="set-analytics-range" data-range="3m">Last 3 Months</button>' +
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
        silentHtml += '<div class="an-silent-row" style="cursor:pointer;" data-action="open-bsheet" data-pid="' + pid + '" data-name="' + esc(p.name) + '">' +
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

    var payload = { personId: editModalPid, name: name, role: role, fellowship: fellowship, priority: priority };
    apiPost('editPerson', { payload: payload })
      .then(function(res) {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
        if (res && res.success) {
          invalidatePeopleCache();
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
    try {
      localStorage.setItem('ct-dark', isDark ? '1' : '0');
      localStorage.setItem('flock-theme', isDark ? 'dark' : 'light');
    } catch(e) {
      console.warn('[Flock]', e);
    }
  }
  (function() {
    try {
      var saved = localStorage.getItem('flock-theme');
      var legacy = localStorage.getItem('ct-dark');
      var prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var useDark = saved ? (saved === 'dark') : (legacy ? legacy === '1' : prefersDark);
      if (useDark) document.body.classList.add('dark');
    } catch(e) {
      console.warn('[Flock]', e);
    }
  })();

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // QUICK LOG BOTTOM SHEET
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

