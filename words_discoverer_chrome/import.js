function get_import_list_name() {
    var mode = document.getElementById("importListMode");
    return mode ? mode.value : "wd_learning_vocabulary";
}


function add_new_words(new_words) {
    import_vocabulary_words(get_import_list_name(), new_words, function(num_added, num_skipped) {
        document.getElementById("addedInfo").textContent = spformat(chrome.i18n.getMessage("importAddedInfo"), num_added);
        document.getElementById("skippedInfo").textContent = spformat(chrome.i18n.getMessage("importSkippedInfo"), num_skipped);
        document.getElementById("openVocabAfterImport").style.display = "inline-block";
    });
}

function process_change() {
    var inputElem = document.getElementById("doLoadVocab");
    var baseName = inputElem.files[0].name;
    document.getElementById("fnamePreview").textContent = baseName;
}

function process_submit() {
    var inputElem = document.getElementById("doLoadVocab");
    var file = inputElem.files[0];
    if (!file) {
        document.getElementById("addedInfo").textContent = chrome.i18n.getMessage("importNoFile") || "Select a vocabulary file first.";
        document.getElementById("skippedInfo").textContent = "";
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        var new_words = parse_vocabulary(reader.result);
        add_new_words(new_words);
    }
    reader.readAsText(file);
}

function init_controls() {
    window.onload=function() {
        localizeHtmlPage();
        var listName = new URLSearchParams(window.location.search).get("list");
        if (listName === "wd_user_vocabulary" || listName === "wd_learning_vocabulary") {
            document.getElementById("importListMode").value = listName;
        }
        document.getElementById("vocabSubmit").addEventListener("click", process_submit);
        document.getElementById("doLoadVocab").addEventListener("change", process_change);
        document.getElementById("openVocabAfterImport").addEventListener("click", function() {
            chrome.tabs.create({'url': chrome.runtime.getURL('display.html?list=' + get_import_list_name())});
        });
    }
}

init_controls();
