const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const plain = (value) => JSON.parse(JSON.stringify(value));

function runContextLib() {
    const sandbox = {
        chrome: {
            i18n: {
                getUILanguage: () => "zh-CN",
                getMessage: (key) => ({
                    dictTranslateGoogle: "Translate to {0} in Google",
                    dictMerriamWebster: "Define in Merriam-Webster",
                    dictGoogleDefinition: "Define in Google",
                    dictGoogleImages: "View pictures in Google"
                }[key] || key)
            },
            tabs: {
                sendMessage: (tabId, message) => {
                    sandbox.sentTabMessage = {tabId, message};
                }
            },
            runtime: {
                sendMessage: (message) => {
                    sandbox.sentRuntimeMessage = message;
                }
            }
        },
        spformat: (fmt, value) => fmt.replace("{0}", value)
    };
    vm.createContext(sandbox);
    vm.runInContext(
        fs.readFileSync(path.join(root, "words_discoverer_chrome/common_lib.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "words_discoverer_chrome/context_menu_lib.js"), "utf8"),
        sandbox
    );
    return sandbox;
}

async function runBackgroundLib() {
    const sandbox = {
        Headers,
        chrome: {
            runtime: {sendMessage: () => {}},
            storage: {local: {set: () => {}}},
            windows: {
                get: (id, cb) => cb({left: 100, top: 50, width: 1200, height: 800}),
                create: (opts) => {
                    sandbox.createdWindow = opts;
                }
            }
        }
    };
    const source = fs
        .readFileSync(path.join(root, "words_discoverer_chrome/common_lib.js"), "utf8") + "\n" + fs
        .readFileSync(path.join(root, "words_discoverer_chrome/background.js"), "utf8")
        .replace(/\ninitialize_extension\(\);\s*$/, "\n");

    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    sandbox.gdrive_token = "token";

    const textResult = await new Promise((resolve) => {
        sandbox.fetch = () => Promise.resolve({
            status: 200,
            headers: {get: () => "application/json"},
            text: () => Promise.resolve("a number of words")
        });
        sandbox.drive_request({path: "https://example.test/media", response_type: "text"}, resolve);
    });
    assert.strictEqual(textResult.body, "a number of words");
    assert.strictEqual(textResult.result, undefined);

    const jsonResult = await new Promise((resolve) => {
        sandbox.fetch = () => Promise.resolve({
            status: 200,
            headers: {get: () => "application/json"},
            text: () => Promise.resolve('{"files":[]}')
        });
        sandbox.drive_request({path: "https://example.test/files"}, resolve);
    });
    assert.strictEqual(Array.isArray(jsonResult.result.files), true);
    assert.strictEqual(jsonResult.result.files.length, 0);

    const definitionResult = await new Promise((resolve) => {
        sandbox.fetch = (url) => {
            assert.strictEqual(url, "https://api.dictionaryapi.dev/api/v2/entries/en/apple");
            return Promise.resolve({
                status: 200,
                ok: true,
                json: () => Promise.resolve([{
                    word: "apple",
                    phonetics: [{text: "/apple/", audio: "https://audio.test/apple.mp3"}],
                    meanings: [{
                        partOfSpeech: "noun",
                        definitions: [{
                            definition: "a round fruit",
                            example: "an apple a day",
                            synonyms: ["fruit"]
                        }]
                    }]
                }])
            });
        };
        sandbox.fetch_free_dictionary_definition("Apple", resolve, false);
    });
    assert.strictEqual(definitionResult.found, true);
    assert.strictEqual(definitionResult.phonetic, "/apple/");
    assert.strictEqual(definitionResult.meanings[0].definitions[0].definition, "a round fruit");

    let uploaded = false;
    let uploadRequest = null;
    sandbox.drive_request = (req, cb) => {
        uploadRequest = req;
        cb({status: 200});
    };
    sandbox.upload_file_content("file-1", "hello", () => {
        uploaded = true;
    });
    assert.strictEqual(uploadRequest.path, "https://www.googleapis.com/upload/drive/v3/files/file-1?uploadType=media");
    assert.strictEqual(uploaded, true);

    sandbox.open_lookup_popup("https://example.test/word", {tab: {windowId: 1}});
    assert.strictEqual(sandbox.createdWindow.url, "https://example.test/word");
    assert.strictEqual(sandbox.createdWindow.type, "popup");
    assert.strictEqual(sandbox.createdWindow.width, 760);

    sandbox.open_lookup_popup("https://example.test/word", {}, {left: 320, top: 240});
    assert.strictEqual(sandbox.createdWindow.left, 320);
    assert.strictEqual(sandbox.createdWindow.top, 240);

    const synced = [];
    const feedback = [];
    sandbox.chrome.runtime.sendMessage = (message) => feedback.push(message);
    sandbox.chrome.storage.local.get = (keys, cb) => cb({
        wd_user_vocabulary: {known: 1},
        wd_learning_vocabulary: {learn: 1}
    });
    sandbox.perform_full_sync = (vocab, done) => {
        synced.push(vocab);
        done();
    };
    sandbox.sync_user_vocabularies();
    assert.deepStrictEqual(synced.map((vocab) => vocab.name), ["my_vocabulary", "learning_vocabulary"]);
    assert.deepStrictEqual(plain(synced[0].added), {known: 1});
    assert.deepStrictEqual(plain(synced[1].added), {learn: 1});
    assert.strictEqual(synced[1].storage_key, "wd_learning_vocabulary");
    assert.strictEqual(synced[1].added_key, "wd_learning_vocab_added");
    assert.strictEqual(synced[1].deleted_key, "wd_learning_vocab_deleted");
    assert.deepStrictEqual(plain(feedback.pop()), {sync_feedback: 1});

    let backupQuery = null;
    sandbox.find_gdrive_id = (query) => {
        backupQuery = query;
    };
    sandbox.backup_vocabulary("dir-1", {name: "learning_vocabulary", all: {}, added: {}, deleted: {}}, () => {});
    assert.match(backupQuery, /\.learning_vocabulary\.backup/);
}

function runVocabListPage() {
    class Node {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.children = [];
            this.attributes = {};
            this.eventListeners = {};
            this.style = {};
            this.textContent = "";
            this.value = "";
        }

        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        }

        removeChild(child) {
            const index = this.children.indexOf(child);
            if (index !== -1) {
                this.children.splice(index, 1);
            }
        }

        get firstChild() {
            return this.children[0] || null;
        }

        setAttribute(name, value) {
            this.attributes[name] = String(value);
            if (name === "id") {
                this.id = String(value);
            }
        }

        addEventListener(type, handler) {
            this.eventListeners[type] = handler;
        }

        click() {
            this.eventListeners.click({target: this});
        }
    }

    function findAll(node, predicate, result = []) {
        if (predicate(node)) {
            result.push(node);
        }
        node.children.forEach((child) => findAll(child, predicate, result));
        return result;
    }

    const nodesById = {
        vocabularySection: new Node("div"),
        listSearch: new Node("input"),
        sortMode: new Node("select"),
        entryCount: new Node("div")
    };
    nodesById.sortMode.value = "alpha";
    const messages = [];
    const dictionaryRequests = [];
    const fakeDefinition = {
        ok: true,
        found: true,
        word: "apple",
        phonetic: "/apple/",
        audio: "",
        meanings: [{
            partOfSpeech: "noun",
            definitions: [{definition: "a round fruit", example: "an apple a day", synonyms: []}],
            synonyms: ["fruit"]
        }]
    };
    const sandbox = {
        document: {
            createElement: (tagName) => new Node(tagName),
            createTextNode: (text) => {
                const node = new Node("#text");
                node.textContent = text;
                return node;
            },
            getElementById: (id) => nodesById[id] || null,
            querySelector: () => null,
            addEventListener: () => {}
        },
        chrome: {
            i18n: {getMessage: () => ""},
            runtime: {
                sendMessage: (message, cb) => {
                    if (message.wdm_request === "free_dictionary") {
                        dictionaryRequests.push({word: message.word, force: message.force_refresh ? true : false});
                        cb(fakeDefinition);
                        return;
                    }
                    messages.push(message);
                }
            },
            storage: {local: {get: () => {}, set: () => {}}},
            tabs: {create: () => {}}
        },
        make_default_online_dicts: () => [],
        get_dict_definition_url: (url, text) => url + encodeURIComponent(text),
        localizeHtmlPage: () => {},
        saveAs: () => {},
        sync_if_needed: () => {},
        spformat: (fmt, value) => fmt.replace("{0}", value)
    };

    vm.createContext(sandbox);
    vm.runInContext(
        fs.readFileSync(path.join(root, "words_discoverer_chrome/common_lib.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "words_discoverer_chrome/black_white.js"), "utf8"),
        sandbox
    );

    sandbox.list_state.userList = {apple: 1, "a number of": 1};
    sandbox.list_state.dictWords = {apple: ["apple", 4]};
    sandbox.list_state.dictIdioms = {"a number of": "a number of"};
    sandbox.list_state.onlineDicts = [
        {title: "PopupDict", url: "https://example.test?q="}
    ];
    sandbox.list_state.wordMaxRank = 100;
    sandbox.render_vocab_page();

    assert.strictEqual(findAll(nodesById.vocabularySection, (node) => node.tagName === "DETAILS").length, 2);
    assert.strictEqual(nodesById.entryCount.textContent, "2 entries");

    nodesById.listSearch.value = "apple";
    sandbox.render_vocab_page();
    const entries = findAll(nodesById.vocabularySection, (node) => node.tagName === "DETAILS");
    assert.strictEqual(entries.length, 1);
    assert.deepStrictEqual(dictionaryRequests, []);

    const dictButton = findAll(entries[0], (node) => node.tagName === "BUTTON" && node.textContent === "PopupDict")[0];
    dictButton.click();
    assert.strictEqual(messages.pop().wdm_lookup_popup_url, "https://example.test?q=apple");
    assert.strictEqual(findAll(entries[0], (node) => node.attributes.class === "lookupPanel").length, 0);
    entries[0].open = true;
    entries[0].eventListeners.toggle();
    assert.deepStrictEqual(dictionaryRequests, [{word: "apple", force: false}]);
    const definitionPanel = findAll(entries[0], (node) => node.attributes.class === "vocabDefinitionPanel")[0];
    const definitionText = findAll(definitionPanel, (node) => node.attributes.class === "wdDefinitionText")[0];
    assert.strictEqual(definitionText.textContent, "1. a round fruit");
    const refreshButton = findAll(definitionPanel, (node) => node.attributes.class === "wdDefinitionRefresh")[0];
    assert.strictEqual(refreshButton, undefined);
    const refreshIcon = findAll(definitionPanel, (node) => node.attributes.class === "wdDefinitionIcon wdDefinitionRefresh")[0];
    assert.strictEqual(refreshIcon.textContent, "");
    assert.strictEqual(refreshIcon.attributes.title, "Refresh");
    const popupIcon = findAll(definitionPanel, (node) => node.attributes.class === "wdDefinitionIcon wdDefinitionPopup")[0];
    assert.strictEqual(popupIcon.textContent, "");
    assert.strictEqual(popupIcon.attributes.title, "Open in Free Dictionary");
    refreshIcon.click();
    assert.deepStrictEqual(dictionaryRequests, [{word: "apple", force: false}, {word: "apple", force: true}]);
    popupIcon.click();
    assert.strictEqual(messages.pop().wdm_lookup_popup_url, "https://www.thefreedictionary.com/apple");

    let markedKnown = null;
    sandbox.add_known_lexeme = (lexeme, cb) => {
        markedKnown = lexeme;
        cb("ok", "apple");
    };
    sandbox.list_state.listName = "wd_learning_vocabulary";
    sandbox.list_state.userList = {apple: 1};
    sandbox.list_state.lists = {wd_learning_vocabulary: {apple: 1}, wd_user_vocabulary: {}};
    sandbox.render_vocab_page();
    const markKnownButton = findAll(nodesById.vocabularySection, (node) => node.tagName === "BUTTON" && node.textContent === "Mark Known")[0];
    markKnownButton.click();
    assert.strictEqual(markedKnown, "apple");
    assert.deepStrictEqual(sandbox.list_state.lists.wd_learning_vocabulary, {});
    assert.deepStrictEqual(sandbox.list_state.lists.wd_user_vocabulary, {apple: 1});

    let deletedState = null;
    let syncCalled = false;
    sandbox.sync_if_needed = () => {
        syncCalled = true;
    };
    sandbox.chrome.storage.local.get = (keys, cb) => cb({
        wd_learning_vocabulary: {banana: 1},
        wd_learning_vocab_added: {banana: 1, old: 1},
        wd_learning_vocab_deleted: {}
    });
    sandbox.chrome.storage.local.set = (state, cb) => {
        deletedState = state;
        cb();
    };
    sandbox.process_delete_learning_entry("banana");
    assert.deepStrictEqual(plain(deletedState.wd_learning_vocabulary), {});
    assert.deepStrictEqual(plain(deletedState.wd_learning_vocab_added), {old: 1});
    assert.deepStrictEqual(plain(deletedState.wd_learning_vocab_deleted), {banana: 1});
    assert.strictEqual(syncCalled, true);
}

(async function main() {
    const ctx = runContextLib();
    assert.strictEqual(ctx.google_translate_lang("zh-CN"), "zh-CN");
    assert.strictEqual(ctx.google_translate_url("zh-CN"), "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=");
    assert.strictEqual(ctx.get_dict_definition_url(ctx.google_translate_url("zh-CN"), "a number of"), "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=a%20number%20of");

    assert.strictEqual(ctx.make_default_online_dicts()[0].url, "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=");
    assert.doesNotMatch(JSON.stringify(ctx.make_default_online_dicts()), /wd-builtin:\/\/free-dictionary/);
    assert.deepStrictEqual(plain(ctx.sanitize_online_dicts([
        {title: "Free Dictionary", url: "wd-builtin://free-dictionary"},
        {title: "PopupDict", url: "https://example.test?q="}
    ])), [{title: "PopupDict", url: "https://example.test?q="}]);
    ctx.showDefinition("https://example.test?q=", "apple", {id: 7});
    assert.strictEqual(ctx.sentRuntimeMessage.wdm_lookup_popup_url, "https://example.test?q=apple");

    const contentScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/content_script.js"), "utf8");
    assert.match(contentScript, /bubbleDOM\.addEventListener\("mousedown"[\s\S]*?e\.stopPropagation\(\);/);
    assert.match(contentScript, /wdm_lookup_popup_url/);
    assert.match(contentScript, /wdm_popup_position/);
    assert.match(contentScript, /wdm_mark_learning/);
    assert.match(contentScript, /make_learning_hl_style/);
    assert.match(contentScript, /markKnownButton/);
    assert.match(contentScript, /current_is_highlighted/);
    assert.match(contentScript, /free_dictionary/);
    assert.match(contentScript, /builtinDefinitionButton/);
    assert.doesNotMatch(contentScript, /wdm_show_free_dictionary/);
    assert.doesNotMatch(contentScript, /is_free_dictionary_url/);
    assert.doesNotMatch(contentScript, /addEventListener\('mousemove'/);

    const listScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/black_white.js"), "utf8");
    assert.match(listScript, /function render_vocab_page\(\)/);
    assert.match(listScript, /document\.createElement\("details"\)/);
    assert.match(listScript, /wd_learning_vocabulary/);
    assert.match(listScript, /wdm_lookup_popup_url/);
    assert.match(listScript, /wd_learning_vocab_deleted/);
    assert.match(listScript, /vocabDefinitionPanel/);
    assert.doesNotMatch(listScript, /shortDefinition/);
    assert.doesNotMatch(listScript, /lookupPanel/);
    assert.match(listScript, /importVocabFile/);

    const backgroundScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/background.js"), "utf8");
    assert.match(backgroundScript, /learning_vocabulary/);
    assert.match(backgroundScript, /wd_learning_vocab_added/);
    assert.match(backgroundScript, /wd_learning_vocab_deleted/);
    assert.match(backgroundScript, /api\.dictionaryapi\.dev/);
    assert.match(backgroundScript, /force_refresh/);

    const contextScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/context_menu_lib.js"), "utf8");
    assert.match(contextScript, /add_learning_lexeme/);
    assert.match(contextScript, /add_known_lexeme/);
    assert.match(contextScript, /vocab_select_known/);
    assert.match(contextScript, /wdm_mark_learning/);
    assert.doesNotMatch(contextScript, /dictFreeDictionary/);
    assert.doesNotMatch(contextScript, /wdm_show_free_dictionary/);
    assert.doesNotMatch(contextScript, /chrome\.tabs\.create\(\{'url': fullUrl\}/);

    const popupScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/popup.js"), "utf8");
    assert.match(popupScript, /wd_learning_vocabulary/);

    const adjustScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/adjust.js"), "utf8");
    assert.match(adjustScript, /loadVocabFile/);
    assert.match(adjustScript, /open_google_drive/);
    assert.doesNotMatch(adjustScript, /add_missing_builtin_dicts/);
    assert.doesNotMatch(adjustScript, /import\.html/);
    assert.strictEqual(fs.existsSync(path.join(root, "words_discoverer_chrome/import.html")), false);
    assert.strictEqual(fs.existsSync(path.join(root, "words_discoverer_chrome/import.js")), false);

    const manifest = JSON.parse(fs.readFileSync(path.join(root, "words_discoverer_chrome/manifest.json"), "utf8"));
    assert.strictEqual(manifest.version, "2.12.13");
    assert.deepStrictEqual(manifest.host_permissions, ["https://api.dictionaryapi.dev/*"]);
    assert.strictEqual(manifest.options_ui.page, "adjust.html");

    runVocabListPage();
    await runBackgroundLib();
})();
