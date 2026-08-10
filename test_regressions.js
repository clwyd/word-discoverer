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
            storage: {local: {set: () => {}}}
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
}

(async function main() {
    const ctx = runContextLib();
    assert.strictEqual(ctx.google_translate_lang("zh-CN"), "zh-CN");
    assert.strictEqual(ctx.google_translate_url("zh-CN"), "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=");
    assert.strictEqual(ctx.get_dict_definition_url(ctx.google_translate_url("zh-CN"), "a number of"), "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=a%20number%20of");

    assert.strictEqual(ctx.make_default_online_dicts()[0].url, "https://translate.google.com/?hl=zh-CN&sl=en&tl=zh-CN&op=translate&text=");

    const contentScript = fs.readFileSync(path.join(root, "words_discoverer_chrome/content_script.js"), "utf8");
    assert.match(contentScript, /bubbleDOM\.addEventListener\("mousedown"[\s\S]*?e\.stopPropagation\(\);/);

    await runBackgroundLib();
})();
