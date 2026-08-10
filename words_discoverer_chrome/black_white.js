var list_section_names = {'wd_black_list': 'blackListSection', 'wd_white_list': 'whiteListSection', 'wd_user_vocabulary': 'vocabularySection'};
var list_state = {
    listName: null,
    userList: {},
    dictWords: {},
    dictIdioms: {},
    onlineDicts: [],
    wordMaxRank: 0
};

function msg(key, fallback) {
    return chrome.i18n.getMessage(key) || fallback;
}

function process_delete_simple(list_name, key) {
    chrome.storage.local.get([list_name], function(result) {
        var user_list = result[list_name] || {};
        delete user_list[key];
        chrome.storage.local.set({[list_name]: user_list});
        show_user_list(list_name, user_list);
    });
}

function process_delete_vocab_entry(key) {
    chrome.storage.local.get(['wd_user_vocabulary', 'wd_user_vocab_added', 'wd_user_vocab_deleted'], function(result) {
        var user_vocabulary = result.wd_user_vocabulary || {};
        var wd_user_vocab_added = result.wd_user_vocab_added;
        var wd_user_vocab_deleted = result.wd_user_vocab_deleted;
        var new_state = {'wd_user_vocabulary': user_vocabulary};
        delete user_vocabulary[key];
        if (typeof wd_user_vocab_added !== 'undefined') {
            delete wd_user_vocab_added[key];
            new_state['wd_user_vocab_added'] = wd_user_vocab_added;
        }
        if (typeof wd_user_vocab_deleted !== 'undefined') {
            wd_user_vocab_deleted[key] = 1;
            new_state['wd_user_vocab_deleted'] = wd_user_vocab_deleted;
        }
        chrome.storage.local.set(new_state, sync_if_needed);
        show_user_list('wd_user_vocabulary', user_vocabulary);
    });
}

function get_list_name() {
    var page = document.querySelector("[data-list-name]");
    if (page) {
        return page.getAttribute("data-list-name");
    }
    if (document.getElementById("blackListSection")) {
        return "wd_black_list";
    }
    if (document.getElementById("whiteListSection")) {
        return "wd_white_list";
    }
    return "wd_user_vocabulary";
}

function get_keys(user_list) {
    var keys = [];
    for (var key in user_list) {
        if (user_list.hasOwnProperty(key)) {
            keys.push(key);
        }
    }
    return keys;
}

function clear_node(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function create_button(label, class_name, handler) {
    var button = document.createElement("button");
    button.textContent = label;
    if (class_name) {
        button.setAttribute("class", class_name);
    }
    button.addEventListener("click", handler);
    return button;
}

function create_simple_delete_button(list_name, text) {
    var result = document.createElement("button");
    result.setAttribute("class", "deleteButton");
    result.expression_text = text;
    if (list_name === 'wd_user_vocabulary') {
        result.addEventListener("click", function(){ process_delete_vocab_entry(this.expression_text); });
    } else {
        result.addEventListener("click", function(){ process_delete_simple(list_name, this.expression_text); });
    }
    var img = document.createElement("img");
    img.setAttribute("src", "delete.png");
    result.appendChild(img);
    return result;
}

function create_label(text) {
    var result = document.createElement("span");
    result.setAttribute("class", "wordText");
    result.textContent = text;
    return result;
}

function get_vocab_info(key) {
    var wordInfo = list_state.dictWords[key];
    var idiomInfo = list_state.dictIdioms[key];
    var result = {
        key: key,
        kind: msg("vocabTypeCustom", "Custom"),
        lemma: key,
        rank: null,
        percentile: null
    };
    if (idiomInfo && idiomInfo !== -1) {
        result.kind = msg("vocabTypeIdiom", "Idiom");
        result.lemma = idiomInfo;
    } else if (wordInfo) {
        result.kind = msg("vocabTypeWord", "Word");
        result.lemma = wordInfo[0];
        result.rank = wordInfo[1];
        if (list_state.wordMaxRank) {
            result.percentile = Math.ceil((result.rank * 100) / list_state.wordMaxRank);
        }
    }
    return result;
}

function sort_vocab_infos(infos) {
    var sortMode = document.getElementById("sortMode");
    var mode = sortMode ? sortMode.value : "alpha";
    infos.sort(function(a, b) {
        if (mode === "frequency") {
            var ar = a.rank || Number.MAX_SAFE_INTEGER;
            var br = b.rank || Number.MAX_SAFE_INTEGER;
            if (ar !== br) {
                return ar - br;
            }
        } else if (mode === "kind" && a.kind !== b.kind) {
            return a.kind.localeCompare(b.kind);
        }
        return a.key.localeCompare(b.key);
    });
}

function open_lookup_popup(url) {
    chrome.runtime.sendMessage({wdm_lookup_popup_url: url});
}

function create_fact(label, value) {
    var box = document.createElement("div");
    box.setAttribute("class", "fact");
    var labelNode = document.createElement("div");
    labelNode.setAttribute("class", "factLabel");
    labelNode.textContent = label;
    var valueNode = document.createElement("div");
    valueNode.setAttribute("class", "factValue");
    valueNode.textContent = value;
    box.appendChild(labelNode);
    box.appendChild(valueNode);
    return box;
}

function create_vocab_entry(info) {
    var entry = document.createElement("details");
    entry.setAttribute("class", "entry");

    var summary = document.createElement("summary");
    var word = document.createElement("span");
    word.setAttribute("class", "word");
    word.textContent = info.key;
    var meta = document.createElement("span");
    meta.setAttribute("class", "meta");
    var kind = document.createElement("span");
    kind.setAttribute("class", "chip");
    kind.textContent = info.kind;
    meta.appendChild(kind);
    if (info.percentile) {
        var freq = document.createElement("span");
        freq.setAttribute("class", "chip");
        freq.textContent = msg("vocabFrequencyShort", "Freq") + " " + info.percentile + "%";
        meta.appendChild(freq);
    }
    summary.appendChild(word);
    summary.appendChild(meta);
    entry.appendChild(summary);

    var body = document.createElement("div");
    body.setAttribute("class", "entryBody");
    var facts = document.createElement("div");
    facts.setAttribute("class", "facts");
    facts.appendChild(create_fact(msg("vocabLemma", "Lemma"), info.lemma));
    facts.appendChild(create_fact(msg("vocabType", "Type"), info.kind));
    facts.appendChild(create_fact(msg("vocabFrequency", "Frequency"), info.percentile ? info.percentile + "%" : "n/a"));
    body.appendChild(facts);

    var actions = document.createElement("div");
    actions.setAttribute("class", "actions");
    actions.appendChild(create_button(msg("audioButton", "Speak"), "", function() {
        chrome.runtime.sendMessage({type: "tts_speak", word: info.key});
    }));
    var dictPairs = list_state.onlineDicts.length ? list_state.onlineDicts : make_default_online_dicts();
    for (var i = 0; i < dictPairs.length; ++i) {
        (function(dict) {
            actions.appendChild(create_button(dict.title, "", function() {
                open_lookup_popup(get_dict_definition_url(dict.url, info.key));
            }));
        })(dictPairs[i]);
    }
    actions.appendChild(create_button(msg("vocabDelete", "Delete"), "danger", function() {
        process_delete_vocab_entry(info.key);
    }));
    body.appendChild(actions);
    entry.appendChild(body);
    return entry;
}

function render_vocab_page() {
    var section = document.getElementById("vocabularySection");
    clear_node(section);
    var queryBox = document.getElementById("listSearch");
    var query = queryBox ? queryBox.value.trim().toLowerCase() : "";
    var infos = get_keys(list_state.userList).map(get_vocab_info).filter(function(info) {
        return !query || info.key.toLowerCase().indexOf(query) !== -1 || info.lemma.toLowerCase().indexOf(query) !== -1;
    });
    sort_vocab_infos(infos);

    var entryCount = document.getElementById("entryCount");
    if (entryCount) {
        entryCount.textContent = spformat(msg("vocabEntryCount", "{0} entries"), infos.length);
    }
    if (!infos.length) {
        var empty = document.createElement("div");
        empty.setAttribute("class", "empty");
        empty.textContent = query ? msg("vocabNoMatches", "No matching entries") : msg("emptyListError", "Empty list");
        section.appendChild(empty);
        return;
    }
    for (var i = 0; i < infos.length; ++i) {
        section.appendChild(create_vocab_entry(infos[i]));
    }
}

function export_vocabulary() {
    var keys = get_keys(list_state.userList);
    keys.sort();
    var blob = new Blob([keys.join('\r\n')], {type: "text/plain;charset=utf-8"});
    saveAs(blob, "my_vocabulary.txt", true);
}

function init_vocab_controls() {
    var search = document.getElementById("listSearch");
    var sort = document.getElementById("sortMode");
    var exportButton = document.getElementById("exportVocab");
    var importButton = document.getElementById("importVocab");
    if (search) {
        search.addEventListener("input", render_vocab_page);
    }
    if (sort) {
        sort.addEventListener("change", render_vocab_page);
    }
    if (exportButton) {
        exportButton.addEventListener("click", export_vocabulary);
    }
    if (importButton) {
        importButton.addEventListener("click", function() {
            chrome.tabs.create({'url': chrome.runtime.getURL('import.html')});
        });
    }
}

function render_simple_list(list_name, user_list) {
    var section_name = list_section_names[list_name];
    var div_element = document.getElementById(section_name);
    clear_node(div_element);
    var keys = get_keys(user_list);
    keys.sort();
    if (!keys.length) {
        div_element.appendChild(create_label(msg("emptyListError", "Empty list")));
        div_element.appendChild(document.createElement("br"));
        return;
    }
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        div_element.appendChild(create_simple_delete_button(list_name, key));
        div_element.appendChild(create_label(key));
        div_element.appendChild(document.createElement("br"));
    }
}

function show_user_list(list_name, user_list) {
    list_state.listName = list_name;
    list_state.userList = user_list || {};
    if (list_name === "wd_user_vocabulary" && document.getElementById("listSearch")) {
        render_vocab_page();
        return;
    }
    render_simple_list(list_name, list_state.userList);
}

function process_display() {
    var list_name = get_list_name();
    var req_keys = [list_name];
    if (list_name === "wd_user_vocabulary" && document.getElementById("listSearch")) {
        req_keys = ['wd_user_vocabulary', 'words_discoverer_eng_dict', 'wd_idioms', 'wd_online_dicts', 'wd_word_max_rank'];
        init_vocab_controls();
    }
    chrome.storage.local.get(req_keys, function(result) {
        list_state.dictWords = result.words_discoverer_eng_dict || {};
        list_state.dictIdioms = result.wd_idioms || {};
        list_state.onlineDicts = result.wd_online_dicts || [];
        list_state.wordMaxRank = result.wd_word_max_rank || 0;
        show_user_list(list_name, result[list_name] || {});
    });
}

document.addEventListener("DOMContentLoaded", function(event) {
    localizeHtmlPage();
    process_display();
});
