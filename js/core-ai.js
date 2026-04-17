  window.Flock = window.Flock || {};
  var _aiParsed = null;       // holds last parsed result

  function openAiAssist() {
    _aiParsed = null;
    document.getElementById('ai-input').value = '';
    document.getElementById('ai-input-msg').className = 'msg';
    document.getElementById('ai-parse-btn').disabled = false;
    document.getElementById('ai-parse-btn').textContent = 'Quick Parse';
    aiShowStep('input');
    document.getElementById('ai-backdrop').classList.add('open');
    document.getElementById('ai-bsheet').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function() { document.getElementById('ai-input').focus(); }, 200);
  }

  function closeAiAssist() {
    document.getElementById('ai-backdrop').classList.remove('open');
    var sheet = document.getElementById('ai-bsheet');
    sheet.classList.remove('open');
    sheet.style.transform = '';
    document.body.style.overflow = '';
    stopVoice();
  }

  var _sheetSwipeReady = false;
  function initBottomSheetSwipe_() {
    if (_sheetSwipeReady) return;
    _sheetSwipeReady = true;
    function wireSwipe(sheetId, onDismiss) {
      var sheet = document.getElementById(sheetId);
      if (!sheet) return;
      var startY = 0;
      var canDrag = false;
      var dragging = false;
      sheet.addEventListener('touchstart', function(e) {
        if (!sheet.classList.contains('open')) return;
        canDrag = sheet.scrollTop <= 0;
        dragging = false;
        startY = e.touches[0].clientY;
      }, { passive: true });
      sheet.addEventListener('touchmove', function(e) {
        if (!canDrag || !sheet.classList.contains('open')) return;
        var dy = e.touches[0].clientY - startY;
        if (dy <= 0) return;
        dragging = true;
        sheet.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });
      sheet.addEventListener('touchend', function(e) {
        if (!sheet.classList.contains('open') || !canDrag || !dragging) return;
        var dy = e.changedTouches[0].clientY - startY;
        if (dy > 120) onDismiss();
        else sheet.style.transform = '';
      });
    }
    wireSwipe('bsheet', closeBsheet);
    wireSwipe('ai-bsheet', closeAiAssist);
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
    btn.disabled = true; btn.textContent = '⏳ Processing...';
    document.getElementById('ai-input-msg').className = 'msg';

    // â”€â”€ Client-side parsing with chrono-node (no API key needed) â”€â”€
    // Reuse the already-loaded allPeople list if available - avoids a second fetch
    var peoplePromise = (allPeople && allPeople.length)
      ? Promise.resolve(allPeople)
      : getPeople();

    peoplePromise.then(function(people) {
      allPeople = Array.isArray(people) ? people : allPeople;
      peopleLoaded = true;
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

      // â”€â”€ Person matching: prioritize full-name word-boundary matches â”€â”€
      var personId = '';
      var personName = '';
      var bestScore = 0;
      people.forEach(function(p) {
        var nameRaw = String(p && p.name || '');
        var nameLower = nameRaw.toLowerCase();
        var parts = nameLower.split(/\s+/).filter(function(part){ return part && part.length > 2; });
        var score = 0;
        if (!parts.length) return;
        var fullNameRe = new RegExp('\\b' + parts.map(function(part){ return escRe_(part); }).join('\\s+') + '\\b', 'i');
        if (fullNameRe.test(desc)) score += 4;
        parts.forEach(function(part) {
          var re = new RegExp('\\b' + escRe_(part) + '\\b', 'i');
          if (re.test(desc)) score++;
        });
        if (parts[0]) {
          var firstRe = new RegExp('\\b' + escRe_(parts[0]) + '\\b', 'i');
          if (firstRe.test(desc)) score += 0.5;
        }
        if (score > bestScore) { bestScore = score; personId = p.id; personName = p.name; }
      });
      if (bestScore === 0) { personId = ''; personName = ''; }

      _aiParsed = { personId: personId, personName: personName, result: result, nextAction: nextAction, nextActionDateTime: nextActionDateTime, summary: summary };
      btn.disabled = false; btn.textContent = 'Quick Parse';
      showAiConfirm(_aiParsed, people);
    }).catch(function(e) {
      btn.disabled = false; btn.textContent = 'Quick Parse';
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
    var people = (Array.isArray(_peopleCache.data) && _peopleCache.data.length) ? _peopleCache.data : allPeople;
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
      : apiPost('saveInteraction', { payload: payload });

    savePromise.then(function(res) {
      if (res && res.success) {
        hapticTick_();
        _homeQuickStatsCache = null;
        if (window.runPostSaveRefresh) runPostSaveRefresh().catch(function(e){ console.warn('[Flock]', e); });
        // Extract action items from summary text and save as todos
        var aiTodos = extractTodosFromText(p.summary || '');
        if (aiTodos.length && res.interactionId) {
          apiPost('saveTodos', { payload: {
            interactionId: res.interactionId,
            personId: p.personId,
            personName: p.personName,
            todos: aiTodos.map(function(t){ return { text: t }; })
          } }).then(function(){ loadTodos && loadTodos(); }).catch(function(e){ console.warn('[Flock]', e); });
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


