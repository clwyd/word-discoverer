var gdrive_token = null;
var free_dictionary_cache = {};

//TODO check chrome.runtime.lastError for all storage.local operations

function do_load_dictionary(file_text) {
    var lines = file_text.split('\n');
    var rare_words = {};
    var rank = 0;
    var prev_lemma = null;
    for (var i = 0; i < lines.length; ++i) {
        var fields = lines[i].split('\t');
        if (i + 1 === lines.length && fields.length == 1)
            break;
        var form = fields[0];
        var lemma = fields[1];
        if (lemma !== prev_lemma) {
            rank += 1;
            prev_lemma = lemma;
        }
        rare_words[fields[0]] = [fields[1], rank];
    }
    local_storage = chrome.storage.local;
    local_storage.set({"words_discoverer_eng_dict": rare_words});
    local_storage.set({"wd_word_max_rank": rank});
}


function load_eng_dictionary() {
    fetch(chrome.runtime.getURL("eng_dict.txt")).then(function (response) {
        return response.text();
    }).then(do_load_dictionary).catch(function (error) {
        console.error("Unable to load English dictionary", error);
    });
}


function do_load_idioms(file_text) {
    var lines = file_text.split('\n');
    var rare_words = {};
    for (var lno = 0; lno < lines.length; ++lno) {
        var fields = lines[lno].split('\t');
        if (lno + 1 === lines.length && fields.length == 1)
            break;
        var words = fields[0].split(' ');
        for (var i = 0; i + 1 < words.length; ++i) {
            key = words.slice(0, i + 1).join(' ');
            rare_words[key] = -1;
        }
        key = fields[0];
        rare_words[key] = fields[1];
    }
    local_storage = chrome.storage.local;
    local_storage.set({"wd_idioms": rare_words});
}


function load_idioms() {
    var file_path = chrome.runtime.getURL("eng_idioms.txt");
    fetch(file_path).then(function (response) {
        return response.text();
    }).then(do_load_idioms).catch(function (error) {
        console.error("Unable to load English idioms", error);
    });
}


function report_sync_failure(error_msg) {
    chrome.storage.local.set({"wd_last_sync_error": error_msg}, function () {
        chrome.runtime.sendMessage({'sync_feedback': 1});
    });
}


function authorize_user(interactive_authorization) {
    chrome.identity.getAuthToken({interactive: interactive_authorization}, function (token) {
        if (chrome.runtime.lastError || token === undefined) {
            var msg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unable to get oauth token';
            report_sync_failure(msg);
        } else {
            gdrive_token = token;
            sync_user_vocabularies();
        }
    });
}


function drive_request(req_params, success_cb) {
    if (!gdrive_token) {
        report_sync_failure('Unable to call Google Drive without oauth token');
        return;
    }

    var headers = new Headers({"Authorization": "Bearer " + gdrive_token});
    var options = {method: req_params.method || "GET", headers: headers};
    if (typeof req_params.body !== 'undefined') {
        if (typeof req_params.body === "string") {
            headers.set("Content-Type", "text/plain;charset=utf-8");
            options.body = req_params.body;
        } else {
            headers.set("Content-Type", "application/json;charset=utf-8");
            options.body = JSON.stringify(req_params.body);
        }
    }

    fetch(req_params.path, options).then(function (response) {
        return response.text().then(function (body) {
            var result = undefined;
            if (body && req_params.response_type !== "text") {
                result = JSON.parse(body);
            }
            success_cb({status: response.status, result: result, body: body});
        });
    }).catch(function (error) {
        report_sync_failure('Google Drive request failed: ' + error);
    });
}


function list_to_set(src_list) {
    result = {};
    for (var i = 0; i < src_list.length; ++i) {
        result[src_list[i]] = 1;
    }
    return result;
}


function substract_from_set(lhs_set, rhs_set) {
    for (var key in rhs_set) {
        if (rhs_set.hasOwnProperty(key) && lhs_set.hasOwnProperty(key)) {
            delete lhs_set[key];
        }
    }
}


function add_to_set(lhs_set, rhs_set) {
    for (var key in rhs_set) {
        if (rhs_set.hasOwnProperty(key)) {
            lhs_set[key] = 1;
        }
    }
}


function serialize_vocabulary(entries) {
    keys = [];
    for (var key in entries) {
        if (entries.hasOwnProperty(key)) {
            keys.push(key);
        }
    }
    keys.sort();
    return keys.join('\r\n');
}


function parse_vocabulary(text) {
    // same text-file format as local vocabulary import
    var lines = text.split('\n');
    var found = [];
    for (var i = 0; i < lines.length; ++i) {
        var word = lines[i];
        if (i + 1 === lines.length && word.length <= 1)
            break;
        if (word.slice(-1) === '\r') {
            word = word.slice(0, -1);
        }
        found.push(word);
    }
    return found;
}


function create_new_dir(dir_name, success_cb) {
    var body = {"name": dir_name, "mimeType": "application/vnd.google-apps.folder", "appProperties": {"wdfile": '1'}};
    var req_params = {'path': 'https://www.googleapis.com/drive/v3/files/', 'method': 'POST', 'body': body};
    drive_request(req_params, function (jsonResp) {
        if (jsonResp.status == 200) {
            success_cb(jsonResp.result.id);
        } else {
            report_sync_failure('Bad dir create status: ' + jsonResp.status);
        }
    });
}


function create_new_file(fname, parent_dir_id, success_cb) {
    var body = {"name": fname, "parents": [parent_dir_id], "appProperties": {"wdfile": '1'}, "mimeType": "text/plain"};
    var req_params = {'path': 'https://www.googleapis.com/drive/v3/files', 'method': 'POST', 'body': body};
    drive_request(req_params, function (jsonResp) {
        if (jsonResp.status == 200) {
            success_cb(jsonResp.result.id);
        } else {
            report_sync_failure('Bad file create status: ' + jsonResp.status);
        }
    });
}


function upload_file_content(file_id, file_content, success_cb) {
    var req_params = {
        'path': 'https://www.googleapis.com/upload/drive/v3/files/' + file_id + '?uploadType=media',
        'method': 'PATCH',
        'body': file_content
    };
    drive_request(req_params, function (jsonResp) {
        if (jsonResp.status == 200) {
            success_cb();
        } else {
            report_sync_failure('Bad upload content status: ' + jsonResp.status);
        }
    });
}


function fetch_file_content(file_id, success_cb) {
    // https://developers.google.com/drive/v3/web/manage-downloads
    var full_query_url = 'https://www.googleapis.com/drive/v3/files/' + file_id + '?alt=media';
    drive_request({'path': full_query_url, 'method': 'GET', 'response_type': 'text'}, function (jsonResp) {
        if (jsonResp.status != 200) {
            report_sync_failure('Bad status: ' + jsonResp.status + ' for getting content of file: ' + file_id);
            return;
        }
        var file_content = jsonResp.body;
        success_cb(file_id, file_content);
    });
}


function find_gdrive_id(query, found_cb, not_found_cb) {
    // generic function to find single object id
    var full_query_url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query);
    drive_request({'path': full_query_url, 'method': 'GET'}, function (jsonResp) {
        if (jsonResp.status != 200) {
            report_sync_failure('Bad status: ' + jsonResp.status + ' for query: ' + query);
            return;
        }
        if (jsonResp.result.files.length > 1) {
            report_sync_failure('More than one object found for query: ' + query);
            return;
        } else if (jsonResp.result.files.length == 1) {
            var drive_id = jsonResp.result.files[0].id
            found_cb(drive_id);
            return;
        }
        not_found_cb();
    });
}


function apply_cloud_vocab(vocab, entries, done) {
    var sync_date = new Date();
    var sync_time = sync_date.getTime();
    var new_state = {
        "wd_last_sync_error": null,
        "wd_last_sync": sync_time
    };
    new_state[vocab.storage_key] = entries;
    new_state[vocab.added_key] = {};
    new_state[vocab.deleted_key] = {};
    chrome.storage.local.set(new_state, function () {
        if (done) {
            done();
        } else {
            chrome.runtime.sendMessage({'sync_feedback': 1});
        }
    });
}


function sync_vocabulary(dir_id, vocab, done) {
    merge_and_upload_vocab = function (file_id, file_content) {
        vocab_list = parse_vocabulary(file_content);
        var entries = list_to_set(vocab_list);
        substract_from_set(entries, vocab.deleted);
        add_to_set(entries, vocab.added);
        merged_content = serialize_vocabulary(entries);

        set_merged_vocab = function () {
            apply_cloud_vocab(vocab, entries, done);
        }
        upload_file_content(file_id, merged_content, set_merged_vocab);
    }

    merge_vocab_to_cloud = function (file_id) {
        fetch_file_content(file_id, merge_and_upload_vocab);
    }

    var vocab_file_name = vocab.name + ".txt";
    var file_query = "name = '" + vocab_file_name + "' and trashed = false and appProperties has { key='wdfile' and value='1' } and '" + dir_id + "' in parents";
    create_new_file_wrap = function () {
        create_new_file(vocab_file_name, dir_id, merge_vocab_to_cloud);
        var new_added = {};
        add_to_set(new_added, vocab.all);
        add_to_set(new_added, vocab.added);
        vocab.added = new_added;
    }
    find_gdrive_id(file_query, merge_vocab_to_cloud, create_new_file_wrap);
}


function backup_vocabulary(dir_id, vocab, success_cb) {
    merge_and_upload_backup = function (file_id, file_content) {
        vocab_list = parse_vocabulary(file_content);
        var entries = list_to_set(vocab_list);
        add_to_set(entries, vocab.all);
        add_to_set(entries, vocab.deleted);
        add_to_set(entries, vocab.added);
        merged_content = serialize_vocabulary(entries);
        upload_file_content(file_id, merged_content, success_cb);
    }
    merge_backup_to_cloud = function (file_id) {
        fetch_file_content(file_id, merge_and_upload_backup);
    }

    var backup_file_name = "." + vocab.name + ".backup";
    var backup_query = "name = '" + backup_file_name + "' and trashed = false and appProperties has { key='wdfile' and value='1' } and '" + dir_id + "' in parents";
    create_new_backup_file_wrap = function () {
        create_new_file(backup_file_name, dir_id, merge_backup_to_cloud);
    }
    find_gdrive_id(backup_query, merge_backup_to_cloud, create_new_backup_file_wrap);
}


function perform_full_sync(vocab, done) {
    var dir_name = "Words Discoverer Sync";
    var dir_query = "name = '" + dir_name + "' and trashed = false and appProperties has { key='wdfile' and value='1' }";
    backup_and_sync_vocabulary = function (dir_id) {
        sync_vocabulary_wrap = function () {
            sync_vocabulary(dir_id, vocab, done);
        }
        backup_vocabulary(dir_id, vocab, sync_vocabulary_wrap);
    }
    create_new_dir_wrap = function () {
        create_new_dir(dir_name, backup_and_sync_vocabulary);
    }
    find_gdrive_id(dir_query, backup_and_sync_vocabulary, create_new_dir_wrap);
}


function sync_vocabularies(vocabs, index) {
    if (index >= vocabs.length) {
        chrome.runtime.sendMessage({'sync_feedback': 1});
        return;
    }
    perform_full_sync(vocabs[index], function () {
        sync_vocabularies(vocabs, index + 1);
    });
}


function sync_user_vocabularies() {
    chrome.storage.local.get(['wd_user_vocabulary', 'wd_user_vocab_added', 'wd_user_vocab_deleted', 'wd_learning_vocabulary', 'wd_learning_vocab_added', 'wd_learning_vocab_deleted'], function (result) {
        var wd_user_vocabulary = result.wd_user_vocabulary;
        var wd_user_vocab_added = result.wd_user_vocab_added;
        var wd_user_vocab_deleted = result.wd_user_vocab_deleted;
        var wd_learning_vocabulary = result.wd_learning_vocabulary;
        var wd_learning_vocab_added = result.wd_learning_vocab_added;
        var wd_learning_vocab_deleted = result.wd_learning_vocab_deleted;
        if (typeof wd_user_vocabulary === 'undefined') {
            wd_user_vocabulary = {};
        }
        if (typeof wd_user_vocab_added === 'undefined') {
            wd_user_vocab_added = Object.assign({}, wd_user_vocabulary);
        }
        if (typeof wd_user_vocab_deleted === 'undefined') {
            wd_user_vocab_deleted = {};
        }
        if (typeof wd_learning_vocabulary === 'undefined') {
            wd_learning_vocabulary = {};
        }
        if (typeof wd_learning_vocab_added === 'undefined') {
            wd_learning_vocab_added = Object.assign({}, wd_learning_vocabulary);
        }
        if (typeof wd_learning_vocab_deleted === 'undefined') {
            wd_learning_vocab_deleted = {};
        }
        var user_vocab = {
            "name": "my_vocabulary",
            "storage_key": "wd_user_vocabulary",
            "added_key": "wd_user_vocab_added",
            "deleted_key": "wd_user_vocab_deleted",
            "all": wd_user_vocabulary,
            "added": wd_user_vocab_added,
            "deleted": wd_user_vocab_deleted
        };
        var learning_vocab = {
            "name": "learning_vocabulary",
            "storage_key": "wd_learning_vocabulary",
            "added_key": "wd_learning_vocab_added",
            "deleted_key": "wd_learning_vocab_deleted",
            "all": wd_learning_vocabulary,
            "added": wd_learning_vocab_added,
            "deleted": wd_learning_vocab_deleted
        };
        sync_vocabularies([user_vocab, learning_vocab], 0);
    });
}


function start_sync_sequence(interactive_authorization) {
    chrome.storage.local.set({"wd_last_sync_error": 'Unknown sync problem'}, function () {
        authorize_user(interactive_authorization);
    });
}


function open_lookup_popup(url, sender, position) {
    var popupOptions = {
        url: url,
        type: "popup",
        width: 760,
        height: 640,
        focused: true
    };
    if (position && typeof position.left === "number" && typeof position.top === "number") {
        popupOptions.left = Math.max(0, position.left);
        popupOptions.top = Math.max(0, position.top);
        chrome.windows.create(popupOptions);
        return;
    }
    if (sender && sender.tab && typeof sender.tab.windowId === "number") {
        chrome.windows.get(sender.tab.windowId, function (win) {
            if (win) {
                popupOptions.left = Math.max(0, win.left + win.width - popupOptions.width - 24);
                popupOptions.top = Math.max(0, win.top + 72);
            }
            chrome.windows.create(popupOptions);
        });
        return;
    }
    chrome.windows.create(popupOptions);
}


function fetch_free_dictionary_definition(word, sendResponse) {
    word = (word || "").toLowerCase().trim();
    if (!word || word.length > 100) {
        sendResponse({ok: false, found: false});
        return;
    }
    if (free_dictionary_cache.hasOwnProperty(word)) {
        sendResponse(free_dictionary_cache[word]);
        return;
    }
    var url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word);
    fetch(url).then(function (response) {
        if (response.status == 404) {
            return {ok: true, found: false, word: word, phonetic: "", audio: "", meanings: []};
        }
        if (!response.ok) {
            throw new Error("Bad status: " + response.status);
        }
        return response.json().then(function (data) {
            return normalize_free_dictionary_response(word, data);
        });
    }).then(function (definition) {
        free_dictionary_cache[word] = definition;
        sendResponse(definition);
    }).catch(function () {
        sendResponse({ok: false, found: false, word: word, phonetic: "", audio: "", meanings: []});
    });
}


function initialize_extension() {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.wdm_request == "hostname") {
            var tab_url = sender.tab.url;
            var url = new URL(tab_url);
            var domain = url.hostname;
            sendResponse({wdm_hostname: domain});
        } else if (request.wdm_request == "page_language") {
            chrome.tabs.detectLanguage(sender.tab.id, function(iso_language_code) {
                sendResponse({wdm_iso_language_code: iso_language_code});
            });
            return true; // This is to indicate that sendResponse would be sent asynchronously and keep the message channel open, see https://developer.chrome.com/extensions/runtime#event-onMessage
        } else if (request.wdm_verdict) {
            if (request.wdm_verdict == "highlight") {
                chrome.storage.local.get(['wd_gd_sync_enabled', 'wd_last_sync_error'], function (result) {
                    chrome.action.setIcon({path: "result48.png", tabId: sender.tab.id}, function () {
                        if (result.wd_gd_sync_enabled) {
                            if (result.wd_last_sync_error == null) {
                                chrome.action.setBadgeText({text: 'sync', tabId: sender.tab.id});
                                chrome.action.setBadgeBackgroundColor({
                                    color: [25, 137, 0, 255],
                                    tabId: sender.tab.id
                                });
                            } else {
                                chrome.action.setBadgeText({text: 'err', tabId: sender.tab.id});
                                chrome.action.setBadgeBackgroundColor({
                                    color: [137, 0, 0, 255],
                                    tabId: sender.tab.id
                                });
                            }
                        }
                    });
                });
            } else if (request.wdm_verdict == "keyboard") {
                chrome.action.setIcon({path: "no_dynamic.png", tabId: sender.tab.id});
            } else {
                chrome.action.setIcon({path: "result48_gray.png", tabId: sender.tab.id});
            }
        } else if (request.wdm_new_tab_url) {
            var fullUrl = request.wdm_new_tab_url;
            chrome.tabs.create({'url': fullUrl}, function (tab) {
            });
        } else if (request.wdm_lookup_popup_url) {
            open_lookup_popup(request.wdm_lookup_popup_url, sender, request.wdm_popup_position);
        } else if (request.wdm_request == "free_dictionary") {
            fetch_free_dictionary_definition(request.word, sendResponse);
            return true;
        } else if (request.wdm_request == "gd_sync") {
            start_sync_sequence(request.interactive_mode);
        }
    });

    chrome.storage.local.get(['words_discoverer_eng_dict', 'wd_hl_settings', 'wd_online_dicts', 'wd_hover_settings', 'wd_idioms', 'wd_show_percents', 'wd_is_enabled', 'wd_user_vocabulary', 'wd_learning_vocabulary', 'wd_black_list', 'wd_white_list', 'wd_gd_sync_enabled', 'wd_enable_tts'], function (result) {
        load_eng_dictionary();
        load_idioms();
        wd_hl_settings = result.wd_hl_settings;
        if (typeof wd_hl_settings == 'undefined') {
            wd_hl_settings = make_default_hl_settings();
            chrome.storage.local.set({"wd_hl_settings": wd_hl_settings});
        }
        wd_enable_tts = result.wd_enable_tts;
        if (typeof wd_enable_tts == 'undefined') {
            chrome.storage.local.set({"wd_enable_tts": false});
        }
        wd_hover_settings = result.wd_hover_settings;
        if (typeof wd_hover_settings == 'undefined') {
            wd_hover_settings = {hl_hover: 'always', ow_hover: 'never'};
            chrome.storage.local.set({"wd_hover_settings": wd_hover_settings});
        }
        var wd_online_dicts = result.wd_online_dicts;
        if (typeof wd_online_dicts == 'undefined') {
            wd_online_dicts = make_default_online_dicts();
            chrome.storage.local.set({"wd_online_dicts": wd_online_dicts});
        }
        initContextMenus(wd_online_dicts);

        show_percents = result.wd_show_percents;
        if (typeof show_percents === 'undefined') {
            chrome.storage.local.set({"wd_show_percents": 15});
        }
        wd_is_enabled = result.wd_is_enabled;
        if (typeof wd_is_enabled === 'undefined') {
            chrome.storage.local.set({"wd_is_enabled": true});
        }
        user_vocabulary = result.wd_user_vocabulary;
        if (typeof user_vocabulary === 'undefined') {
            chrome.storage.local.set({"wd_user_vocabulary": {}});
        }
        var learning_vocabulary = result.wd_learning_vocabulary;
        if (typeof learning_vocabulary === 'undefined') {
            chrome.storage.local.set({"wd_learning_vocabulary": {}});
        }
        black_list = result.wd_black_list;
        if (typeof black_list === 'undefined') {
            chrome.storage.local.set({"wd_black_list": {}});
        }
        white_list = result.wd_white_list;
        if (typeof white_list === 'undefined') {
            chrome.storage.local.set({"wd_white_list": {}});
        }
    });


    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.type === "tts_speak") {
            if (!!request.word && typeof request.word === "string") {
                chrome.tts.speak(request.word, {lang: "en", gender: "male"})
            }
        }
    });
}

initialize_extension();
