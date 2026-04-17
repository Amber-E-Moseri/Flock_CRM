  window.Flock = window.Flock || {};
  function exposeState_(name, getter, setter) {
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: false,
        get: getter,
        set: setter
      });
    } catch (e) {
      try { window[name] = getter(); } catch (_) {}
    }
  }

  Object.assign(window, {
    showPage: showPage,
    openAddPerson: openAddPerson,
    returnFromAddPerson: returnFromAddPerson,
    apiFetch: apiFetch,
    apiPost: apiPost,
    hapticTick_: hapticTick_,
    getGreeting_: getGreeting_,
    getPeople: getPeople,
    invalidatePeopleCache: invalidatePeopleCache,
    loadHome: loadHome,
    ini: ini,
    esc: esc,
    renderSection: renderSection,
    renderDash: renderDash,
    loadDash: loadDash,
    jumpTo: jumpTo,
    goToDashSection: goToDashSection,
    goLogPerson: goLogPerson,
    initLogPage: initLogPage,
    onFocus: onFocus,
    onInput: onInput,
    onKey: onKey,
    pickResult: pickResult,
    pickAction: pickAction,
    saveCall: saveCall,
    resetLog: resetLog,
    resetLogForm: resetLogForm,
    goHistoryPerson: goHistoryPerson,
    initHistoryPage: initHistoryPage,
    filterHistPeople: filterHistPeople,
    renderHistPeopleList: renderHistPeopleList,
    renderHistory: renderHistory,
    initCadencePage: initCadencePage,
    loadAppSettings: loadAppSettings,
    initSettingsPage: initSettingsPage,
    saveYourName: saveYourName,
    saveAppSetting: saveAppSetting,
    asetPickBool: asetPickBool,
    filterCadence: filterCadence,
    renderCadence: renderCadence,
    saveCad: saveCad,
    toggleActive: toggleActive,
    initAddPersonPage: initAddPersonPage,
    resetAddPerson: resetAddPerson,
    submitAddPerson: submitAddPerson,
    loadAnalytics: loadAnalytics,
    setAnalyticsRange: setAnalyticsRange,
    openEditModal: openEditModal,
    closeEditModal: closeEditModal,
    submitEditPerson: submitEditPerson,
    toggleDark: toggleDark,
    openBsheet: openBsheet,
    closeBsheet: closeBsheet,
    bsPick: bsPick,
    saveBsheet: saveBsheet,
    toggleVoice: toggleVoice,
    stopVoice: stopVoice,
    queueOfflineCall: queueOfflineCall,
    syncOfflineQueue: syncOfflineQueue,
    openNotesModal: openNotesModal,
    closeNotesModal: closeNotesModal,
    savePersonNotes: savePersonNotes,
    onSearchInput: onSearchInput,
    doSearch: doSearch,
    openAiAssist: openAiAssist,
    closeAiAssist: closeAiAssist,
    runAiParse: runAiParse,
    aiGoBack: aiGoBack,
    aiOverrideSearch: aiOverrideSearch,
    aiSelectPerson: aiSelectPerson,
    aiPickResult: aiPickResult,
    aiPickAction: aiPickAction,
    confirmAiLog: confirmAiLog,
    inferAssistFromText: inferAssistFromText,
    extractTodosFromText: extractTodosFromText,
    clearPerson: clearPerson,
    toggleRecent: toggleRecent
  });

  exposeState_('allPeople', function(){ return allPeople; }, function(v){ allPeople = Array.isArray(v) ? v : []; });
  exposeState_('selResult', function(){ return selResult; }, function(v){ selResult = String(v || ''); });
  exposeState_('selAction', function(){ return selAction; }, function(v){ selAction = String(v || 'None'); });
  exposeState_('bsPid', function(){ return bsPid; }, function(v){ bsPid = v; });
  exposeState_('bsName', function(){ return bsName; }, function(v){ bsName = v; });
  exposeState_('bsResult', function(){ return bsResult; }, function(v){ bsResult = v; });
  exposeState_('bsAction', function(){ return bsAction; }, function(v){ bsAction = v; });
  exposeState_('_aiParsed', function(){ return _aiParsed; }, function(v){ _aiParsed = v; });
  exposeState_('_offlineQueue', function(){ return _offlineQueue; }, function(v){ _offlineQueue = Array.isArray(v) ? v : []; });
  exposeState_('_peopleCache', function(){ return _peopleCache; }, function(v){ _peopleCache = v || { data: null, promise: null }; });

