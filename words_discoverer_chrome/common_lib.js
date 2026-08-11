function request_unhighlight(lemma) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {wdm_unhighlight: lemma});
    });
}


function request_mark_learning(lemma) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length) {
            chrome.tabs.sendMessage(tabs[0].id, {wdm_mark_learning: lemma}, function() {
            });
        }
    });
}


function make_id_suffix(text) {
    var before = btoa(text);
    var after = before.replace(/\+/g, '_').replace(/\//g, '-').replace(/=/g, '_')
    return after;
}


function sync_if_needed() {
    var req_keys = ['wd_last_sync', 'wd_gd_sync_enabled', 'wd_last_sync_error'];
    chrome.storage.local.get(req_keys, function(result) {
        var wd_last_sync = result.wd_last_sync;
        var wd_gd_sync_enabled = result.wd_gd_sync_enabled;
        var wd_last_sync_error = result.wd_last_sync_error;
        if (!wd_gd_sync_enabled || wd_last_sync_error != null) {
            return;
        }
        var cur_date = new Date();
        var mins_passed = (cur_date.getTime() - wd_last_sync) / (60 * 1000);
        var sync_period_mins = 30;
        if (mins_passed >= sync_period_mins) {
            chrome.runtime.sendMessage({wdm_request: "gd_sync", interactive_mode: false});
        }
    });
}


function get_vocabulary_filename(list_name) {
    return list_name === "wd_learning_vocabulary" ? "learning_vocabulary.txt" : "my_vocabulary.txt";
}


function parse_vocabulary(text) {
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


function normalize_free_dictionary_response(word, data) {
    var result = {ok: true, found: false, word: word, phonetic: "", audio: "", meanings: []};
    if (!Array.isArray(data) || !data.length) {
        return result;
    }
    var first = data[0] || {};
    result.found = true;
    result.word = first.word || word;
    result.phonetic = first.phonetic || "";
    var phonetics = first.phonetics || [];
    for (var i = 0; i < phonetics.length; ++i) {
        if (!result.phonetic && phonetics[i].text) {
            result.phonetic = phonetics[i].text;
        }
        if (!result.audio && phonetics[i].audio) {
            result.audio = phonetics[i].audio;
        }
    }
    for (var e = 0; e < data.length && result.meanings.length < 3; ++e) {
        var meanings = data[e].meanings || [];
        for (var m = 0; m < meanings.length && result.meanings.length < 3; ++m) {
            var source = meanings[m];
            var defs = [];
            var definitions = source.definitions || [];
            for (var d = 0; d < definitions.length && defs.length < 2; ++d) {
                defs.push({
                    definition: definitions[d].definition || "",
                    example: definitions[d].example || "",
                    synonyms: (definitions[d].synonyms || []).slice(0, 5)
                });
            }
            if (defs.length) {
                result.meanings.push({
                    partOfSpeech: source.partOfSpeech || "",
                    definitions: defs,
                    synonyms: (source.synonyms || []).slice(0, 5)
                });
            }
        }
    }
    return result;
}


function render_free_dictionary_definition(container, definition, get_message) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    function msg(key, fallback) {
        return get_message ? (get_message(key) || fallback) : fallback;
    }
    function append_text(class_name, text) {
        var node = document.createElement("div");
        node.setAttribute("class", class_name);
        node.textContent = text;
        container.appendChild(node);
        return node;
    }
    if (!definition || !definition.ok) {
        append_text("wdDefinitionEmpty", msg("definitionUnavailable", "Definition unavailable"));
        return;
    }
    if (!definition.found || !definition.meanings.length) {
        append_text("wdDefinitionEmpty", msg("definitionNone", "No definition found"));
        return;
    }
    if (definition.phonetic) {
        append_text("wdDefinitionPhonetic", definition.phonetic);
    }
    for (var m = 0; m < definition.meanings.length; ++m) {
        var meaning = definition.meanings[m];
        if (meaning.partOfSpeech) {
            append_text("wdDefinitionPart", meaning.partOfSpeech);
        }
        for (var d = 0; d < meaning.definitions.length; ++d) {
            var item = meaning.definitions[d];
            append_text("wdDefinitionText", (d + 1) + ". " + item.definition);
            if (item.example) {
                append_text("wdDefinitionExample", '"' + item.example + '"');
            }
        }
        if (meaning.synonyms && meaning.synonyms.length) {
            append_text("wdDefinitionSynonyms", msg("definitionSynonyms", "Synonyms") + ": " + meaning.synonyms.join(", "));
        }
    }
}


function import_vocabulary_words(list_name, new_words, result_handler) {
    chrome.storage.local.get(['wd_user_vocabulary', 'wd_learning_vocabulary', 'wd_user_vocab_added', 'wd_user_vocab_deleted', 'wd_learning_vocab_added', 'wd_learning_vocab_deleted'], function(result) {
        var user_vocabulary = result.wd_user_vocabulary || {};
        var learning_vocabulary = result.wd_learning_vocabulary || {};
        var wd_user_vocab_added = result.wd_user_vocab_added;
        var wd_user_vocab_deleted = result.wd_user_vocab_deleted;
        var wd_learning_vocab_added = result.wd_learning_vocab_added;
        var wd_learning_vocab_deleted = result.wd_learning_vocab_deleted;
        var num_added = 0;
        var changed = false;
        var new_state = {
            "wd_user_vocabulary": user_vocabulary,
            "wd_learning_vocabulary": learning_vocabulary
        };
        for (var i = 0; i < new_words.length; ++i) {
            var word = new_words[i];
            if (list_name === "wd_learning_vocabulary") {
                var was_learning = learning_vocabulary.hasOwnProperty(word);
                changed = changed || !was_learning || user_vocabulary.hasOwnProperty(word);
                learning_vocabulary[word] = 1;
                delete user_vocabulary[word];
                if (!was_learning) {
                    ++num_added;
                }
                if (typeof wd_user_vocab_added !== 'undefined') {
                    delete wd_user_vocab_added[word];
                    new_state['wd_user_vocab_added'] = wd_user_vocab_added;
                }
                if (typeof wd_user_vocab_deleted !== 'undefined') {
                    wd_user_vocab_deleted[word] = 1;
                    new_state['wd_user_vocab_deleted'] = wd_user_vocab_deleted;
                }
                if (typeof wd_learning_vocab_added !== 'undefined') {
                    wd_learning_vocab_added[word] = 1;
                    new_state['wd_learning_vocab_added'] = wd_learning_vocab_added;
                }
                if (typeof wd_learning_vocab_deleted !== 'undefined') {
                    delete wd_learning_vocab_deleted[word];
                    new_state['wd_learning_vocab_deleted'] = wd_learning_vocab_deleted;
                }
            } else if (list_name === "wd_user_vocabulary") {
                var was_known = user_vocabulary.hasOwnProperty(word);
                changed = changed || !was_known || learning_vocabulary.hasOwnProperty(word);
                user_vocabulary[word] = 1;
                delete learning_vocabulary[word];
                if (!was_known) {
                    ++num_added;
                }
                if (typeof wd_user_vocab_added !== 'undefined') {
                    wd_user_vocab_added[word] = 1;
                    new_state['wd_user_vocab_added'] = wd_user_vocab_added;
                }
                if (typeof wd_user_vocab_deleted !== 'undefined') {
                    delete wd_user_vocab_deleted[word];
                    new_state['wd_user_vocab_deleted'] = wd_user_vocab_deleted;
                }
                if (typeof wd_learning_vocab_added !== 'undefined') {
                    delete wd_learning_vocab_added[word];
                    new_state['wd_learning_vocab_added'] = wd_learning_vocab_added;
                }
                if (typeof wd_learning_vocab_deleted !== 'undefined') {
                    wd_learning_vocab_deleted[word] = 1;
                    new_state['wd_learning_vocab_deleted'] = wd_learning_vocab_deleted;
                }
            }
        }
        var num_skipped = new_words.length - num_added;
        if (!changed) {
            result_handler(num_added, num_skipped);
            return;
        }
        chrome.storage.local.set(new_state, function() {
            sync_if_needed();
            result_handler(num_added, num_skipped);
        });
    });
}


function normalize_lexeme(lexeme, dict_words, dict_idioms) {
    if (lexeme.length > 100) {
        return null;
    }
    lexeme = lexeme.toLowerCase();
    lexeme = lexeme.trim();
    if (!lexeme) {
        return null;
    }

    var key = lexeme;
    if (dict_words.hasOwnProperty(lexeme)) {
        var wf = dict_words[lexeme];
        if (wf) {
            key = wf[0];
        }
    } else if (dict_idioms.hasOwnProperty(lexeme)) {
        var iwf = dict_idioms[lexeme];
        if (iwf && iwf != -1) {
            key = iwf;
        }
    }
    return key;
}


function add_known_lexeme(lexeme, result_handler) {
    var req_keys = ['words_discoverer_eng_dict', 'wd_idioms', 'wd_user_vocabulary', 'wd_learning_vocabulary', 'wd_user_vocab_added', 'wd_user_vocab_deleted', 'wd_learning_vocab_added', 'wd_learning_vocab_deleted'];
    chrome.storage.local.get(req_keys, function(result) {
        var dict_words = result.words_discoverer_eng_dict || {};
        var dict_idioms = result.wd_idioms || {};
        var user_vocabulary = result.wd_user_vocabulary || {};
        var learning_vocabulary = result.wd_learning_vocabulary || {};
        var wd_user_vocab_added = result.wd_user_vocab_added;
        var wd_user_vocab_deleted = result.wd_user_vocab_deleted;
        var wd_learning_vocab_added = result.wd_learning_vocab_added;
        var wd_learning_vocab_deleted = result.wd_learning_vocab_deleted;
        var key = normalize_lexeme(lexeme, dict_words, dict_idioms);
        if (!key) {
            result_handler("bad", undefined);
            return;
        }

        user_vocabulary[key] = 1;
        delete learning_vocabulary[key];
        var new_state = {
            'wd_user_vocabulary': user_vocabulary,
            'wd_learning_vocabulary': learning_vocabulary
        };
        if (typeof wd_user_vocab_added !== 'undefined') {
            wd_user_vocab_added[key] = 1;
            new_state['wd_user_vocab_added'] = wd_user_vocab_added;
        }
        if (typeof wd_user_vocab_deleted !== 'undefined') {
            delete wd_user_vocab_deleted[key];
            new_state['wd_user_vocab_deleted'] = wd_user_vocab_deleted;
        }
        if (typeof wd_learning_vocab_added !== 'undefined') {
            delete wd_learning_vocab_added[key];
            new_state['wd_learning_vocab_added'] = wd_learning_vocab_added;
        }
        if (typeof wd_learning_vocab_deleted !== 'undefined') {
            wd_learning_vocab_deleted[key] = 1;
            new_state['wd_learning_vocab_deleted'] = wd_learning_vocab_deleted;
        }

        chrome.storage.local.set(new_state, function() {
            sync_if_needed();
            result_handler("ok", key);
        });
    });
}


function add_learning_lexeme(lexeme, result_handler) {
    var req_keys = ['words_discoverer_eng_dict', 'wd_idioms', 'wd_user_vocabulary', 'wd_learning_vocabulary', 'wd_user_vocab_added', 'wd_user_vocab_deleted', 'wd_learning_vocab_added', 'wd_learning_vocab_deleted'];
    chrome.storage.local.get(req_keys, function(result) {
        var dict_words = result.words_discoverer_eng_dict || {};
        var dict_idioms = result.wd_idioms || {};
        var user_vocabulary = result.wd_user_vocabulary || {};
        var learning_vocabulary = result.wd_learning_vocabulary || {};
        var wd_user_vocab_added = result.wd_user_vocab_added;
        var wd_user_vocab_deleted = result.wd_user_vocab_deleted;
        var wd_learning_vocab_added = result.wd_learning_vocab_added;
        var wd_learning_vocab_deleted = result.wd_learning_vocab_deleted;
        var key = normalize_lexeme(lexeme, dict_words, dict_idioms);
        if (!key) {
            result_handler("bad", undefined);
            return;
        }

        learning_vocabulary[key] = 1;
        delete user_vocabulary[key];
        var new_state = {
            'wd_user_vocabulary': user_vocabulary,
            'wd_learning_vocabulary': learning_vocabulary
        };
        if (typeof wd_user_vocab_added !== 'undefined') {
            delete wd_user_vocab_added[key];
            new_state['wd_user_vocab_added'] = wd_user_vocab_added;
        }
        if (typeof wd_user_vocab_deleted !== 'undefined') {
            wd_user_vocab_deleted[key] = 1;
            new_state['wd_user_vocab_deleted'] = wd_user_vocab_deleted;
        }
        if (typeof wd_learning_vocab_added !== 'undefined') {
            wd_learning_vocab_added[key] = 1;
            new_state['wd_learning_vocab_added'] = wd_learning_vocab_added;
        }
        if (typeof wd_learning_vocab_deleted !== 'undefined') {
            delete wd_learning_vocab_deleted[key];
            new_state['wd_learning_vocab_deleted'] = wd_learning_vocab_deleted;
        }

        chrome.storage.local.set(new_state, function() {
            sync_if_needed();
            result_handler("ok", key);
        });
    });
}


function add_lexeme(lexeme, result_handler) {
    add_known_lexeme(lexeme, result_handler);
}


function make_default_hl_settings() {
    return {
        wordParams: {
            enabled: true,
            quoted: false,
            bold: true,
            useBackground: false,
            backgroundColor: "rgb(255, 248, 220)",
            useColor: true,
            color: "red"
        },
        idiomParams: {
            enabled: true,
            quoted: false,
            bold: true,
            useBackground: false,
            backgroundColor: "rgb(255, 248, 220)",
            useColor: true,
            color: "blue"
        }
    };
}


function make_learning_hl_style() {
    return "font-weight:bold;background-color:#fff2a8;color:#16202a;border-bottom:2px solid #117c73;font-size:inherit;display:inline;";
}


function make_hl_style(hl_params) {
    if (!hl_params.enabled)
        return undefined;
    result = "";
    if (hl_params.bold)
        result += "font-weight:bold;";
    if (hl_params.useBackground)
        result += "background-color:" + hl_params.backgroundColor + ";";
    if (hl_params.useColor)
        result += "color:" + hl_params.color + ";";
    if (!result)
        return undefined;
    result += "font-size:inherit;display:inline;";
    return result;
}


function localizeHtmlPage() {
    function msg(key) {
        return key ? chrome.i18n.getMessage(key) : "";
    }
    function replaceTokens(text) {
        return text.replace(/__MSG_(\w+)__/g, function(match, key) {
            var translated = msg(key);
            return translated || match;
        });
    }

    document.querySelectorAll("[data-i18n]").forEach(function(node) {
        var translated = msg(node.getAttribute("data-i18n"));
        if (translated) {
            node.textContent = translated;
        }
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function(node) {
        var translated = msg(node.getAttribute("data-i18n-html"));
        if (translated) {
            node.innerHTML = translated;
        }
    });

    ["title", "placeholder", "value", "aria-label", "alt"].forEach(function(attr) {
        document.querySelectorAll("[data-i18n-" + attr + "]").forEach(function(node) {
            var translated = msg(node.getAttribute("data-i18n-" + attr));
            if (translated) {
                node.setAttribute(attr, translated);
            }
        });
    });

    var walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    for (var i = 0; i < nodes.length; i++) {
        var oldText = nodes[i].nodeValue;
        var newText = replaceTokens(oldText);
        if (newText !== oldText) {
            nodes[i].nodeValue = newText;
        }
    }
}


function spformat(src) {
    var args = Array.prototype.slice.call(arguments, 1);
    return src.replace(/{(\d+)}/g, function(match, number) { 
        return typeof args[number] != 'undefined' ? args[number] : match;
    });
}
