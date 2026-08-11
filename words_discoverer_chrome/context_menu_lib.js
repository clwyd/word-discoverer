var isoLangs = {
    "ab": "Abkhaz",
    "aa": "Afar",
    "af": "Afrikaans",
    "ak": "Akan",
    "sq": "Albanian",
    "am": "Amharic",
    "ar": "Arabic",
    "an": "Aragonese",
    "hy": "Armenian",
    "as": "Assamese",
    "av": "Avaric",
    "ae": "Avestan",
    "ay": "Aymara",
    "az": "Azerbaijani",
    "bm": "Bambara",
    "ba": "Bashkir",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bh": "Bihari",
    "bi": "Bislama",
    "bs": "Bosnian",
    "br": "Breton",
    "bg": "Bulgarian",
    "my": "Burmese",
    "ca": "Catalan",
    "ch": "Chamorro",
    "ce": "Chechen",
    "ny": "Chichewa",
    "zh": "Chinese",
    "cv": "Chuvash",
    "kw": "Cornish",
    "co": "Corsican",
    "cr": "Cree",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "dv": "Divehi",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "ee": "Ewe",
    "fo": "Faroese",
    "fj": "Fijian",
    "fi": "Finnish",
    "fr": "French",
    "ff": "Fula",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "ht": "Haitian",
    "ha": "Hausa",
    "he": "Hebrew",
    "hz": "Herero",
    "hi": "Hindi",
    "ho": "Hiri Motu",
    "hu": "Hungarian",
    "ia": "Interlingua",
    "id": "Indonesian",
    "ie": "Interlingue",
    "ga": "Irish",
    "ig": "Igbo",
    "ik": "Inupiaq",
    "io": "Ido",
    "is": "Icelandic",
    "it": "Italian",
    "iu": "Inuktitut",
    "ja": "Japanese",
    "jv": "Javanese",
    "kl": "Kalaallisut",
    "kn": "Kannada",
    "kr": "Kanuri",
    "ks": "Kashmiri",
    "kk": "Kazakh",
    "km": "Khmer",
    "ki": "Kikuyu",
    "rw": "Kinyarwanda",
    "ky": "Kirghiz",
    "kv": "Komi",
    "kg": "Kongo",
    "ko": "Korean",
    "ku": "Kurdish",
    "kj": "Kwanyama",
    "la": "Latin",
    "lb": "Luxembourgish",
    "lg": "Luganda",
    "li": "Limburgish",
    "ln": "Lingala",
    "lo": "Lao",
    "lt": "Lithuanian",
    "lu": "Luba-Katanga",
    "lv": "Latvian",
    "gv": "Manx",
    "mk": "Macedonian",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mh": "Marshallese",
    "mn": "Mongolian",
    "na": "Nauru",
    "nv": "Navajo",
    "nd": "Ndebele",
    "ne": "Nepali",
    "ng": "Ndonga",
    "nn": "Norwegian",
    "no": "Norwegian",
    "ii": "Nuosu",
    "nr": "Ndebele",
    "oc": "Occitan",
    "oj": "Ojibwe",
    "om": "Oromo",
    "or": "Oriya",
    "os": "Ossetian",
    "pa": "Panjabi",
    "fa": "Persian",
    "pl": "Polish",
    "ps": "Pashto",
    "pt": "Portuguese",
    "qu": "Quechua",
    "rm": "Romansh",
    "rn": "Kirundi",
    "ro": "Romanian",
    "ru": "Russian",
    "sc": "Sardinian",
    "sd": "Sindhi",
    "se": "Sami",
    "sm": "Samoan",
    "sg": "Sango",
    "sr": "Serbian",
    "gd": "Gaelic",
    "sn": "Shona",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovene",
    "so": "Somali",
    "st": "Sotho",
    "es": "Spanish",
    "su": "Sundanese",
    "sw": "Swahili",
    "ss": "Swati",
    "sv": "Swedish",
    "ta": "Tamil",
    "te": "Telugu",
    "tg": "Tajik",
    "th": "Thai",
    "ti": "Tigrinya",
    "bo": "Tibetan",
    "tk": "Turkmen",
    "tl": "Tagalog",
    "tn": "Tswana",
    "to": "Tonga",
    "tr": "Turkish",
    "ts": "Tsonga",
    "tt": "Tatar",
    "tw": "Twi",
    "ty": "Tahitian",
    "ug": "Uighur",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "uz": "Uzbek",
    "ve": "Venda",
    "vi": "Vietnamese",
    "wa": "Walloon",
    "cy": "Welsh",
    "wo": "Wolof",
    "fy": "Frisian",
    "xh": "Xhosa",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "za": "Zhuang"
};

function get_dict_definition_url(dictUrl, text) {
    return dictUrl + encodeURIComponent(text);
}

function google_translate_lang(rawLang) {
    var lang = (rawLang || "en").replace("_", "-");
    var lowerLang = lang.toLowerCase();
    if (lowerLang == "zh" || lowerLang == "zh-cn" || lowerLang == "zh-sg") {
        return "zh-CN";
    }
    if (lowerLang == "zh-tw" || lowerLang == "zh-hk" || lowerLang == "zh-mo") {
        return "zh-TW";
    }
    return lang.split("-")[0];
}

function google_translate_url(targetLang) {
    var lang = encodeURIComponent(targetLang);
    return "https://translate.google.com/?hl=" + lang + "&sl=en&tl=" + lang + "&op=translate&text=";
}

function showDefinition(dictUrl, text) {
    var fullUrl = get_dict_definition_url(dictUrl, text);
    chrome.tabs.create({'url': fullUrl}, function(tab) {
      // opens definition in a new tab
    });
}

function createDictionaryEntry(title, dictUrl, entryId) {
    chrome.contextMenus.create({"title": title, "contexts":["selection"], "id": entryId});
}

function context_handle_learning_result(tab, report, lemma) {
    if (report === "ok" && tab && typeof tab.id === "number") {
        chrome.tabs.sendMessage(tab.id, {wdm_mark_learning: lemma}, function() {
        });
    }
}

function onClickHandler(info, tab) {
    var word = info.selectionText;
    add_learning_lexeme(word, function(report, lemma) {
        context_handle_learning_result(tab, report, lemma);
    });
};


function contextDictionaryHandler(info) {
    var entryId = String(info.menuItemId || "");
    if (!entryId.startsWith("wd_define_")) {
        return;
    }
    var dictNo = parseInt(entryId.split("_")[2], 10);
    if (isNaN(dictNo)) {
        return;
    }
    chrome.storage.local.get(["wd_online_dicts"], function(result) {
        var dictPairs = result.wd_online_dicts || make_default_online_dicts();
        if (dictNo >= 0 && dictNo < dictPairs.length) {
            showDefinition(dictPairs[dictNo].url, info.selectionText);
        }
    });
}


function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "vocab_select_add") {
        onClickHandler(info, tab);
    } else {
        contextDictionaryHandler(info);
    }
}


function make_default_online_dicts() {
    result = [];

    var rawUiLang = chrome.i18n.getUILanguage();
    var uiLang = rawUiLang.split(/[-_]/)[0];
    if (uiLang != 'en' && isoLangs.hasOwnProperty(uiLang)) {
        var langName = isoLangs[uiLang];
        result.push({
            title: spformat(chrome.i18n.getMessage("dictTranslateGoogle"), langName),
            url: google_translate_url(google_translate_lang(rawUiLang))
        });
    }
    result.push({title: chrome.i18n.getMessage("dictMerriamWebster"), url: "https://www.merriam-webster.com/dictionary/"});
    result.push({title: chrome.i18n.getMessage("dictGoogleDefinition"), url: "https://encrypted.google.com/search?hl=en&gl=en&q=define:"});
    result.push({title: chrome.i18n.getMessage("dictGoogleImages"), url: "https://encrypted.google.com/search?hl=en&gl=en&tbm=isch&q="});
    return result;
}

function initContextMenus(dictPairs) {
    chrome.contextMenus.removeAll(function() {
        var title = chrome.i18n.getMessage("menuItem");
        chrome.contextMenus.create({"title": title, "contexts":["selection"], "id": "vocab_select_add"});
        chrome.contextMenus.create({type: 'separator', "contexts":["selection"], "id": "wd_separator_id"});
        for (var i = 0; i < dictPairs.length; ++i) {
            createDictionaryEntry(dictPairs[i].title, dictPairs[i].url, "wd_define_" + i);
        }
    });
}


if (typeof window === "undefined" && chrome.contextMenus && chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
}
