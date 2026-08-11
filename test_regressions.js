const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;

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
            }
        },
        spformat: (fmt, value) => fmt.replace("{0}", value)
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, "words_discoverer_chrome/context_menu_lib.js"), "utf8"), sandbox);
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
            runtime: {sendMessage: (message) => messages.push(message)},
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
    vm.runInContext(fs.readFileSync(path.join(root, "words_discoverer_chrome/black_white.js"), "utf8"), sandbox);

    sandbox.list_state.userList = {apple: 1, "a number of": 1};
    sandbox.list_state.dictWords = {apple: ["apple", 4]};
    sandbox.list_state.dictIdioms = {"a number of": "a number of"};
    sandbox.list_state.onlineDicts = [{title: "PopupDict", url: "https://example.test?q="}];
    sandbox.list_state.wordMaxRank = 100;
    sandbox.render_vocab_page();

    assert.strictEqual(findAll(nodesById.vocabularySection, (node) => node.tagName === "DETAILS").length, 2);
    assert.strictEqual(nodesById.entryCount.textContent, "2 entries");

    nodesById.listSearch.value = "apple";
    sandbox.render_vocab_page();
    const entries = findAll(nodesById.vocabularySection, (node) => node.tagName === "DETAILS");
    assert.strictEqual(entries.length, 1);

    const dictButton = findAll(entries[0], (node) => node.tagName === "BUTTON" && node.textContent === "PopupDict")[0];
    dictButton.click();
    assert.strictEqual(messages.pop().wdm_lookup_popup_url, "https://example.test?q=apple");

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
}

(async function main() {
    const ctx = runContextLib();
    assert.strictEqual(ctx.google_translate_lang("zh-CN"), "zh-CN");
    assert.strictEqual(ctx.google_translate_url("zh-CN"), "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=");
    assert.strictEqual(ctx.get_dict_definition_url(ctx.google_translate_url("zh-CN"), "a number of"), "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=a%20number%20of");

    assert.strictEqual(ctx.make_default_online_dicts()[0].url, "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=");

    const contentScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/content_script.js"), "utf8");
    assert.match(contentScript, /bubbleDOM\.addEventListener\("mousedown"[\s\S]*?e\.stopPropagation\(\);/);
    assert.match(contentScript, /wdm_lookup_popup_url/);
    assert.match(contentScript, /wdm_popup_position/);
    assert.match(contentScript, /wdm_mark_learning/);
    assert.match(contentScript, /make_learning_hl_style/);
    assert.match(contentScript, /markKnownButton/);
    assert.match(contentScript, /current_is_highlighted/);
    assert.doesNotMatch(contentScript, /addEventListener\('mousemove'/);

    const listScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/black_white.js"), "utf8");
    assert.match(listScript, /function render_vocab_page\(\)/);
    assert.match(listScript, /document\.createElement\("details"\)/);
    assert.match(listScript, /wd_learning_vocabulary/);

    const contextScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/context_menu_lib.js"), "utf8");
    assert.match(contextScript, /add_learning_lexeme/);
    assert.match(contextScript, /add_known_lexeme/);
    assert.match(contextScript, /vocab_select_known/);
    assert.match(contextScript, /wdm_mark_learning/);
    assert.doesNotMatch(contextScript, /chrome\.tabs\.create\(\{'url': fullUrl\}/);

    const popupScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/popup.js"), "utf8");
    assert.match(popupScript, /wd_learning_vocabulary/);

    const importScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/import.js"), "utf8");
    assert.match(importScript, /importListMode/);
    assert.match(importScript, /wd_learning_vocabulary/);

    const manifest = JSON.parse(fs.readFileSync(path.join(root, "words_discoverer_chrome/manifest.json"), "utf8"));
    assert.strictEqual(manifest.version, "2.12.7");
    assert.strictEqual(manifest.options_ui.page, "adjust.html");

    runVocabListPage();
    await runBackgroundLib();
})();
