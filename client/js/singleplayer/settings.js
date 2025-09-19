define(function() {

    var cached = null,
        STORAGE_KEY = 'bq-singleplayer';

    function parseQuery() {
        var query = window.location.search || '',
            hash = window.location.hash || '',
            pattern = /singleplayer\s*=\s*(1|true|yes)/i;

        if(pattern.test(query) || pattern.test(hash)) {
            return true;
        }
        return false;
    }

    function readStoredPreference() {
        try {
            if(window.localStorage) {
                var value = window.localStorage.getItem(STORAGE_KEY);
                if(value === '1' || value === 'true') {
                    return true;
                }
            }
        } catch(e) {
            // Access to localStorage can throw in some environments (privacy mode). Ignore and fallback to defaults.
        }
        return false;
    }

    function rememberPreference(enabled) {
        try {
            if(window.localStorage) {
                if(enabled) {
                    window.localStorage.setItem(STORAGE_KEY, '1');
                } else {
                    window.localStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch(e) {
            // Ignore persistence errors and rely solely on runtime detection.
        }
    }

    function isEnabled() {
        if(cached === null) {
            cached = parseQuery() || readStoredPreference();
        }
        return cached;
    }

    return {
        isEnabled: isEnabled,
        remember: function(enabled) {
            cached = !!enabled;
            rememberPreference(cached);
        }
    };
});
