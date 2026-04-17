  window.Flock = window.Flock || {};
  function apiFetch(action, params) {
    if (!API) return Promise.reject(new Error('API URL is not configured.'));
    var url = API + '?action=' + action;
    if (params) {
      Object.keys(params).forEach(function(k){
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      });
    }
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 15000);
    return fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
      .then(function(r) {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function(text) {
        try {
          return normalizeApiResponse_(JSON.parse(text));
        } catch (e) {
          throw new Error('Response was not JSON: ' + text.slice(0, 200));
        }
      })
      .catch(function(e) {
        clearTimeout(timeoutId);
        if (e && e.name === 'AbortError') throw new Error('Request timed out — please try again');
        throw e;
      });
  }

  function apiPost(action, payload) {
    if (!API) return Promise.reject(new Error('API URL is not configured.'));
    payload = payload || {};
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 15000);
    return fetch(API + '?action=' + encodeURIComponent(action), {
      method: 'POST',
      redirect: 'follow',
      // Use a "simple request" content type to avoid CORS preflight failures
      // against Apps Script web apps (which often don't answer OPTIONS).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    })
      .then(function(r) {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function(text) {
        try {
          return normalizeApiResponse_(JSON.parse(text));
        } catch (e) {
          throw new Error('Response was not JSON: ' + text.slice(0, 200));
        }
      })
      .catch(function(e) {
        clearTimeout(timeoutId);
        if (e && e.name === 'AbortError') throw new Error('Request timed out — please try again');
        throw e;
      });
  }

  function normalizeApiResponse_(res) {
    if (!res || typeof res !== 'object') return res;
    if (Object.prototype.hasOwnProperty.call(res, 'success')) {
      if (!res.success) throw new Error(res.error || 'Request failed');
      if (Object.prototype.hasOwnProperty.call(res, 'data')) return res.data;
      return res;
    }
    if (Object.prototype.hasOwnProperty.call(res, 'error')) {
      throw new Error(res.error || 'Request failed');
    }
    return res;
  }

  function hapticTick_() {
    if (navigator.vibrate) navigator.vibrate(30);
  }

  document.addEventListener('click', function(e) {
    var tab = e.target.closest('#mobile-tab-bar .tab-item');
    if (!tab) return;
    var pageId = tab.getAttribute('data-page');
    if (!pageId) return;
    showPage(pageId);
  });

  function getGreeting_() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }
  window.getGreeting_ = getGreeting_;

  var _homeQuickStatsCache = null;
  var _peopleCache = { data: null, promise: null };

  function invalidatePeopleCache() {
    _peopleCache = { data: null, promise: null };
    window._peopleCache = _peopleCache;
  }

  function getPeople(forceRefresh) {
    if (!forceRefresh && Array.isArray(_peopleCache.data)) return Promise.resolve(_peopleCache.data);
    if (!forceRefresh && _peopleCache.promise) return _peopleCache.promise;
    _peopleCache.promise = apiFetch('people').then(function(list) {
      _peopleCache.data = Array.isArray(list) ? list : [];
      _peopleCache.promise = null;
      window._peopleCache = _peopleCache;
      return _peopleCache.data;
    }).catch(function(e) {
      _peopleCache.promise = null;
      window._peopleCache = _peopleCache;
      throw e;
    });
    return _peopleCache.promise;
  }
  window.getPeople = getPeople;
  window.invalidatePeopleCache = invalidatePeopleCache;
  window._peopleCache = _peopleCache;


