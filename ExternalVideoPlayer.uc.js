
if(typeof window.externalVideoPlayer != 'undefined'){
    window.externalVideoPlayer.uninit();
    delete window.externalVideoPlayer;
}

(function(){

    var IS_CLOSE_TAB = false;  // 启动后是否关闭标签

    var DEFAULT_ENCODING = "gbk";  // 默认播放列表编码

    // 下载设置
    var IDM_PATH = "D:\\GreenSoftware\\IDM6.23.16\\IDMan.exe";

    var VIDEO_FORMAT = {  // 清晰度
        "normal": "标清",
        "high": "高清",
        "super": "超清",
    };

    var PLAYER_PLS = /\bs?mplayer\b/i;  // pls 播放列表格式
    var PLAYER_XSPF = /\bvlc\b/i;  // xspf 播放列表格式
    var PLAYER_URLS = /^$/i;  // 直接传递地址
    var PLAYER_COPY = /BaiduPlayer/i;  // 复制链接到剪贴板

    var LINK_CLICKED_COLOR = "#666666";
    var LINK_SHOW_REGEXP = /^http:\/\/d\.pcs\.baidu\.com\/file\/|\.(?:mp4|flv|rm|rmvb|mkv|asf|wmv|avi|mpeg|mpg|mov|qt)$/i;
    var HOST_REGEXP = /www\.soku\.com|youku|yinyuetai|ku6|umiwi|sina|163|56|joy|v\.qq|letv|(tieba|mv|zhangmen)\.baidu|wasu|pps|kankan|funshion|tangdou|acfun\.tv|www\.bilibili\.tv|v\.ifeng\.com|cntv\.cn/i;



    let { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;
    Components.utils.import("resource://gre/modules/FileUtils.jsm");

    var Instances = {
        get fp() Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker),
        get lf() Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile),
        get process() Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess),
    };

    var ns = window.externalVideoPlayer = {
        FILE_NAME: "externalVideoPlayer",
        _canPlay: true,
        get prefs() {
            delete this.prefs;
            return this.prefs = Services.prefs.getBranch("userChromeJS.ExternalVideoPlayer.");
        },
        get IDM_hidden() {
            if(!this._IDM_hidden){
                var idm_file = FileUtils.File(IDM_PATH);
                this._IDM_hidden = !idm_file.exists()
            }
            return this._IDM_hidden;
        },

        init: function(){
            var contextMenu = $("contentAreaContextMenu");

            this._menuitem = this.createMenuItem();
            contextMenu.insertBefore(this._menuitem, contextMenu.firstChild);

            contextMenu.addEventListener("popupshowing", this, false);
        },
        uninit: function(){
            if(this._menuitem)
                this._menuitem.parentNode.removeChild(this._menuitem);

            $("contentAreaContextMenu").removeEventListener("popupshowing", this, false);
        },
        handleEvent: function(event){
            switch(event.type){
                case "popupshowing":
                    if (event.target != event.currentTarget) return;
                    this._menuitem.hidden = !this.isValidLocation();
                    if(gContextMenu.onLink){
                        this._menuitem.setAttribute("label", "使用外部播放器播放");
                    }else{
                        this._menuitem.setAttribute("label", "使用外部播放器播放");
                    }
                    break;
            }
        },
        createMenuItem: function(){
            var menu, menupopup, menuitem;

            menu = $C("menu", {
                class: "menu-iconic",
                image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAfElEQVQ4jd3SsQ2DQAyF4U+EniEiZQkKpHRMkmnSZJEMkEHY4BpWQLo0R4ROEBGowi+5st+zLZvD0CIgLkRINSMnPKYGAfWXBnWqgQqvZPwh5ooZIs7ocN9qEHCb06wx6NHkmmKFcMqwlNi8QvnjBFc8cckTu8+4+5H+mDfRrSxKQWpCmgAAAABJRU5ErkJggg==",
                id: "external-video-player",                
                label: "使用外部播放器播放",
                tooltiptext: "直接点击播放",
                condition: "noselect nolink nomailto noimage nomedia noinput",
                accesskey: "v",
               
            });
            menu.addEventListener("click", function(event){
                if(event.target == menu){
                    event.stopPropagation();
                    externalVideoPlayer.run();
                }
            }, false);

            menupopup = $C("menupopup", {});

            // create menuitem dynamic
            for(var format in VIDEO_FORMAT){
                let label = VIDEO_FORMAT[format];
                menuitem = $C("menuitem", {
                    label: "播放（" + label + "）",
                    oncommand: "externalVideoPlayer.run('" + format + "')",
                });
                menupopup.appendChild(menuitem);
            }

            menupopup.appendChild($C("menuseparator", {}));

            menuitem = $C("menuitem", {
                label: "打开 Flvcd 的解析链接",
                oncommand: "externalVideoPlayer.run(null, 'openFlvcd')",
            });
            menupopup.appendChild(menuitem);

            menuitem = $C("menuitem", {
                label: "下载（内置）",
                oncommand: "externalVideoPlayer.run(null, 'download_normal')",
            });
            menupopup.appendChild(menuitem);

            menuitem = $C("menuitem", {
                label: "下载（IDM）",
                hidden: ns.IDM_hidden,
                oncommand: "externalVideoPlayer.run('super', 'download_IDM')",
            });
            menupopup.appendChild(menuitem);

            // menuitem = $C("menuitem", {
            //  label: "下载（Aria2）",
            //  oncommand: "externalVideoPlayer.run(null, 'download_aria2')",
            // });
            // menupopup.appendChild(menuitem);

            menupopup.appendChild($C("menuseparator", {}));

            menuitem = $C("menuitem", {
                label: "设置播放器",
                oncommand: "externalVideoPlayer.getPlayer(true)",
            });
            menupopup.appendChild(menuitem);

            menu.appendChild(menupopup);
            return menu;
        },
        isValidLocation: function(){
            // 设置初始值
            this._canPlay = true;
            this.execOnceURL = null;

            var hostname = content.location.hostname;

            if(gContextMenu.onLink){
                if(hostname == "www.flvcd.com" || LINK_SHOW_REGEXP.test(gContextMenu.linkURL)){
                    this.execOnceURL = gContextMenu.linkURL;
                    return true;
                }
            } else {
                var selection = Util.getSelection();
                if(selection && LINK_SHOW_REGEXP.test(selection)){
                    this.execOnceURL = selection;
                    return true;
                }
            }

            if(HOST_REGEXP.test(hostname)){
                return true;
            }

            // tudou 没法用外置播放器看，其它由于网络限制，只能用硕鼠下载
            if(/tudou|qiyi|v\.sohu\.com|v\.pptv/.test(hostname)){
                this._canPlay = false;
                return true;
            }

            // funshion 不支持？

            return false;
        },
        run: function(format, type){
            // 直接启动播放器
            if(this.execOnceURL){
                this.launchPlayer(this.execOnceURL);
                if(gContextMenu.target){
                    gContextMenu.target.style.color = LINK_CLICKED_COLOR;
                }
                return;
            }

            var onLink = gContextMenu && gContextMenu.onLink,
                url = onLink ? gContextMenu.linkURL : content.location.href,
                toCloseTab = IS_CLOSE_TAB && !onLink ? gBrowser.mCurrentTab : null;

            var flvcdUrl = 'http://www.flvcd.com/parse.php?kw=' + encodeURIComponent(url);
            if(format){
                flvcdUrl += '&format=' + format;
            }

            if(!this._canPlay && !type || type == 'openFlvcd'){
                return this.openFlvcd(flvcdUrl);
            }

            this._requestUrl = flvcdUrl;

            getHTML(flvcdUrl, function(){
                if(this.readyState == 4 && this.status == 200){
                    var opened = ns.requestLoaded(this.response, type);
                    if(opened && toCloseTab){
                        gBrowser.removeTab(toCloseTab, { animate: true });
                    }
                }else{
                    throw new Error(this.statusText);
                }
            }, "gbk");
        },
        requestLoaded: function(doc, type){
            var elem = doc.querySelectorAll(".mn.STYLE4")[2];
            if(!elem){
                this.openFlvcd();
                return false;
            }

            var title = doc.querySelector('input[name="name"]').getAttribute("value");
            var links = elem.querySelectorAll("a");

            var list = [];
            var len = links.length;
            if(len == 0){
                this.openFlvcd();
                return false;
            }else if(len == 1){
                list.push({
                    title: title,
                    url: links[0].href
                });
            }else{
                for (var i = 0; i < len; i++) {
                    let num = i + 1;
                    if(num < 10)
                        num = "0" + num;
                    list.push({
                        title: title + "-" + num,
                        url: links[i].href
                    });
                }
            }

            if (type && this[type]) {  // download_IDM 等
                this[type](list);
                return false;
            } else {
                this.launchPlayer(list);
                return true;
            }

            return true;
        },
        getPlayer: function(change){
            if(!change){
                var file;
                try{
                    file = this.prefs.getComplexValue("player", Ci.nsILocalFile);
                }catch(e) {}

                if(file && file.exists() && file.isExecutable()){
                    return file;
                }
            }

            var nsIFilePicker = Ci.nsIFilePicker;
            var fp = Instances.fp;
            fp.init(window, '请选择播放器', nsIFilePicker.modeOpen);
            fp.appendFilters(nsIFilePicker.filterApplication);
            fp.appendFilters(nsIFilePicker.filterAll);

            if (fp.show() != nsIFilePicker.returnOK)
                return null;

            if (fp.file.exists() && fp.file.isExecutable()) {
                this.prefs.setComplexValue("player", Ci.nsILocalFile, fp.file);
                return fp.file;
            }
        },
        launchPlayer: function(listFileOrUrl){
            var args,
                player = this.getPlayer();

            if(!player) return;

            if (listFileOrUrl instanceof Array) { // fileList
                listFileOrUrl = this.checkPlayList(listFileOrUrl, player.path);
            }

            if (typeof listFileOrUrl == "undefined") {
                args = [];
            } else if (typeof listFileOrUrl == "string") {
                args = [listFileOrUrl];
            } else if (listFileOrUrl instanceof Array) {
                args = listFileOrUrl;
            } else {
                args = [listFileOrUrl.path];
            }

            var process = Instances.process;
            process.init(player);
            process.runAsync(args, args.length);
        },
        checkPlayList: function(list, playerPath){
            var type,
                encoding = DEFAULT_ENCODING,
                arr = playerPath.split("\\"),
                playerName = arr[arr.length - 1];

            switch(true){
                case PLAYER_PLS.test(playerName):
                    type = ".pls";
                    break;
                case PLAYER_XSPF.test(playerName):
                    type = ".xspf";
                    encoding = "utf-8";
                    break;
                case PLAYER_URLS.test(playerName):
                    return getListURLs();
                case PLAYER_COPY.test(playerName):
                    var urls = getListURLs();
                    Util.clipboardWrite(urls.join("\n"));
                    break;
                default:
                    type = ".asx";
                    break;
            }

            if(type){
                var text = this.getPlayList(list, type);
                if(text){
                    var file = this.savePlayList(this.FILE_NAME + type, text, encoding);
                    return file;
                }
            }

            function getListURLs(){
                var urls = [];
                list.forEach(function(info){
                    urls.push(info.url);
                });
                return urls;
            }
        },
        getPlayList: function(list, type){
            var text, item_tpl;
            switch(type){
                case ".asx":
                    text = '<asx version = "3.0" >\n\n';
                    item_tpl = '<entry>\n' +
                        '   <title>{title}</title>\n' +
                        '   <ref href = "{url}" />\n' +
                        '</entry>\n\n';

                    list.forEach(function(info){
                        text += nano(item_tpl, info);
                    });

                    text += "</asx>";
                    break;
                case ".pls":
                    text = "[playlist]\n";
                    item_tpl = 'File{i}="{url}"\n' +
                        'Title{i}="{title}"\n' +
                        'Length{i}=0\n';

                    list.forEach(function(info, i){
                        info.i = i + 1;
                        info.title = encode_16(info.title);

                        text += nano(item_tpl, info);
                    });
                    text += "NumberOfEntries=" + list.length + "\nVersion=2";
                    break;
                case ".xspf":
                    text = '<?xml version="1.0" encoding="UTF-8"?>\n' +
                            '<playlist xmlns="http://xspf.org/ns/0/" xmlns:vlc="http://www.videolan.org/vlc/playlist/ns/0/" version="1">\n' +
                            '    <title>播放列表</title>\n' +
                            '    <trackList>\n';

                    item_tpl = '        <track>\n' +
                        '            <location>{url}</location>\n' +
                        '            <title>{title}</title>\n' +
                        '            <extension application="http://www.videolan.org/vlc/playlist/0">\n' +
                        '                <vlc:id>{i}</vlc:id>\n' +
                        '                <vlc:option>network-caching=1000</vlc:option>\n' +
                        '            </extension>\n' +
                        '        </track>\n';

                    list.forEach(function(info, i){
                        info.i = i;
                        info.url = info.url.replace(/&/g, "&amp;");  // 腾讯视频需要这样
                        text += nano(item_tpl, info);
                    });
                    text += "    </trackList>\n</playlist>";
                    break;
                case "copy":
                    var urls = [];
                    list.forEach(function(info){
                        urls.push(info.url);
                    });
                    text = urls.join("\n");
                    break;
                case "urls":
                    break;
                default:
                    break;
            }

            return text;
        },
        openFlvcd: function(flvcdUrl){
            flvcdUrl = flvcdUrl || ns._requestUrl;
            if(flvcdUrl){
                gBrowser.selectedTab = gBrowser.addTab(flvcdUrl);
            }
        },
        savePlayList: function(fileName, data, encoding){
            var tmpfile = FileUtils.getFile("TmpD", [fileName]);
            tmpfile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);

            var suConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
            suConverter.charset = encoding || 'gbk';
            data = suConverter.ConvertFromUnicode(data);

            var foStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
            foStream.init(tmpfile, 0x02 | 0x08 | 0x20, 0664, 0);
            foStream.write(data, data.length);
            foStream.close();

            return tmpfile;
        },
        download_normal: function(filelist){
            if(filelist.length > 1){
                var result = confirm("该视频由" + filelist.length + "个片段组成，是否要用内置的同时下载？取消复制链接到剪贴板");
                if (!result) {
                    var str = this.getPlayList(filelist, "copy");
                    Util.clipboardWrite(str);
                    return;
                }
            }

            var fileExt = this.getVideoExt(filelist[0].url);

            var func = "(" + internalSave.toString()
                    .replace("let ", "")
                    .replace("var fpParams", "fileInfo.fileExt=null;fileInfo.fileName=aDefaultFileName;var fpParams") + ")",
                useDownloadDir = Services.prefs.getBoolPref("browser.download.useDownloadDir");

            filelist.forEach(function(file, i){
                eval(func)(file.url, null, file.title + fileExt, null, null, null, null, null, null,
                        document, useDownloadDir, null);
            });
        },
        download_IDM: function(filelist){
            var fileExt = this.getVideoExt(filelist[0].url);

            filelist.forEach(function(file, i){
                var title_gbk = ns.convert_to_gbk(Util.safeTitle(file.title));
                Util.exec(IDM_PATH, ["/a", "/d", file.url, "/f", title_gbk + fileExt], true);
            });

            // 再次运行，激活到前台
            Util.exec(IDM_PATH);
        },
        download_aria2: function(filelist){

        },
        getVideoExt: function(url){
            var ext;
            switch(true){
                case url.indexOf("/flv/") != -1:  // youku
                case url.indexOf(".flv?sc=") != -1: // 音悦台
                    ext = ".flv";
                    break;
                case url.indexOf("/mp4/") != -1:
                    ext = ".mp4";
                    break;
                case url.indexOf("/f4v/") != -1:
                    ext = ".f4v";
                    break;
                default:
                    ext = ".flv";
                    break;
            }

            return ext;
        },
        convert_to_gbk: function(data){
            var suConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
            suConverter.charset = 'gbk';
            return suConverter.ConvertFromUnicode(data);
        },
    };

    var Util = (function(){
        var getFocusWindow = function (){
            return gContextMenu && gContextMenu.target ? gContextMenu.target.ownerDocument.defaultView : content;
        };

        var getRangeAll = function (win) {
            win || (win = getFocusWindow());
            var sel = win.getSelection();
            var res = [];
            for (var i = 0; i < sel.rangeCount; i++) {
                res.push(sel.getRangeAt(i));
            }
            return res;
        };

        var getSelection = function(win) {
            // from getBrowserSelection Fx19
            win || (win = getFocusWindow());
            var selection  = getRangeAll(win).join(" ");
            if (!selection) {
                let element = document.commandDispatcher.focusedElement;
                let isOnTextInput = function (elem) {
                    return elem instanceof HTMLTextAreaElement ||
                        (elem instanceof HTMLInputElement && elem.mozIsTextField(true));
                };

                if (isOnTextInput(element)) {
                    selection = element.QueryInterface(Ci.nsIDOMNSEditableElement)
                        .editor.selection.toString();
                }
            }

            if (selection) {
                selection = selection.replace(/^\s+/, "")
                    .replace(/\s+$/, "")
                    .replace(/\s+/g, " ");
            }
            return selection;
        };

        var clipboardWrite = function(str){
            Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper)
                .copyString(str);
        };

        var exec = function(path, args, blocking){
            args || (args = []);
            blocking || (blocking = false);

            var file    = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
            var process = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
            try {
                file.initWithPath(path);

                if (!file.exists()) {
                    Cu.reportError('File Not Found: ' + path);
                }

                if (file.isExecutable()) {
                    process.init(file);
                    process.run(blocking, args, args.length);
                } else {
                    file.launch();
                }

            } catch(e) {}
        };

        var safeTitle = function(title) {
            return title.replace(/[\\\|\:\*\"\?\<\>]/g,"_");
        };

        return {
            getSelection: getSelection,
            clipboardWrite: clipboardWrite,
            exec: exec,
            safeTitle: safeTitle
        };
    })();


    function debug() { Application.console.log("[ExternalVideoPlayer]" + Array.slice(arguments)); }
    function $(id) document.getElementById(id);
    function $C(name, attr) {
        var el = document.createElement(name);
        if (attr) Object.keys(attr).forEach(function(n) el.setAttribute(n, attr[n]));
        return el;
    }

    function getHTML(url, callback, charset){
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "document";
        xhr.onload = callback;
        xhr.onerror = function(){
            alert("Flvcd.com 无法访问或网络不通");
        };
        if(charset)
            xhr.overrideMimeType("text/html; charset=" + charset);
        xhr.send(null);
    }

    function nano(template, data) {
        return template.replace(/\{([\w\.]*)\}/g, function(str, key) {
            var keys = key.split("."),
                v = data[keys.shift()];
            for (var i = 0, l = keys.length; i < l; i++) v = v[keys[i]];
            return (typeof v !== "undefined" && v !== null) ? v : "";
        });
    }

    function encode_16(str){
        var s = ""
        for (var i = 0; i < str.length; i++) {
            s += "\\x" + str.charCodeAt(i).toString(16)
        }
        return s
    }

})();


window.externalVideoPlayer.init();