  window.Flock = window.Flock || {};
  var API = (function() {
    var m = document.querySelector('meta[name="flock-api-url"]');
    return (m && m.getAttribute('content') ? m.getAttribute('content').trim() : '');
  })();
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

  function showApiMissingBanner_() {
    if (API || document.getElementById('api-missing-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'api-missing-banner';
    banner.textContent = 'API URL is missing. Set <meta name="flock-api-url" content="..."> in index.html.';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#fef3c7;color:#7c2d12;border-bottom:1px solid #fcd34d;padding:10px 14px;font-size:13px;font-weight:600;text-align:center;';
    document.body.appendChild(banner);
  }
  if (!API) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showApiMissingBanner_);
    else showApiMissingBanner_();
  }

  function updateMobileTabState_(pageId) {
    var bar = document.getElementById('mobile-tab-bar');
    if (!bar) return;
    bar.querySelectorAll('.tab-item').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-page') === pageId);
    });
  }

  function activePageId_() {
    var active = document.querySelector('.page.active');
    return active ? active.id : 'pg-home';
  }

  function showPage(id, pushState) {
    var currentId = activePageId_();
    if (id === 'pg-addperson' && currentId !== 'pg-addperson') {
      _addPersonReturn = { page: currentId || 'pg-home', scrollY: window.scrollY || 0 };
    }
    document.querySelectorAll('.page').forEach(function(p){
      p.classList.remove('active');
      p.classList.remove('page-in');
    });
    var targetPage = document.getElementById(id);
    if (!targetPage) return;
    targetPage.classList.add('active');
    targetPage.classList.add('page-in');
    setTimeout(function(){ targetPage.classList.remove('page-in'); }, 220);
    updateMobileTabState_(id);
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


