(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.promise = require('./src/promise.js').promise;
var talkify = require('./src/talkify.js');
var talkifyConfig = require('./src/talkify-config.js');
var talkifyHttp = require('./src/talkify-ajax.js');
var Timer = require('./src/talkify-timer.js');
var TalkifyTextextractor = require('./src/talkify-textextractor.js');
var TalkifyWordHighlighter = require('./src/talkify-word-highlighter.js');
var BasePlayer = require('./src/talkify-player-core.js');
var Html5Player = require('./src/talkify-html5-speechsynthesis-player.js');
var TtsPlayer = require('./src/talkify-player.js');
var talkifyPlaylist = require('./src/talkify-playlist.js');
var talkifyPlaybar = require('./src/talkify-audiocontrols.js');



},{"./src/promise.js":2,"./src/talkify-ajax.js":3,"./src/talkify-audiocontrols.js":4,"./src/talkify-config.js":5,"./src/talkify-html5-speechsynthesis-player.js":6,"./src/talkify-player-core.js":7,"./src/talkify-player.js":8,"./src/talkify-playlist.js":9,"./src/talkify-textextractor.js":10,"./src/talkify-timer.js":11,"./src/talkify-word-highlighter.js":12,"./src/talkify.js":13}],2:[function(require,module,exports){
/*
 *  Copyright 2012-2013 (c) Pierre Duquesne <stackp@online.fr>
 *  Licensed under the New BSD License.
 *  https://github.com/stackp/promisejs
 */

(function (exports) {

    function Promise() {
        this._callbacks = [];
    }

    Promise.prototype.then = function (func, context) {
        var p;
        if (this._isdone) {
            p = func.apply(context, this.result);
        } else {
            p = new Promise();
            this._callbacks.push(function () {
                var res = func.apply(context, arguments);
                if (res && typeof res.then === 'function')
                    res.then(p.done, p);
            });
        }
        return p;
    };

    Promise.prototype.done = function () {
        this.result = arguments;
        this._isdone = true;
        for (var i = 0; i < this._callbacks.length; i++) {
            this._callbacks[i].apply(null, arguments);
        }
        this._callbacks = [];
    };

    function join(promises) {
        var p = new Promise();
        var results = [];

        if (!promises || !promises.length) {
            p.done(results);
            return p;
        }

        var numdone = 0;
        var total = promises.length;

        function notifier(i) {
            return function () {
                numdone += 1;
                results[i] = Array.prototype.slice.call(arguments);
                if (numdone === total) {
                    p.done(results);
                }
            };
        }

        for (var i = 0; i < total; i++) {
            promises[i].then(notifier(i));
        }

        return p;
    }

    function chain(funcs, args) {
        var p = new Promise();
        if (funcs.length === 0) {
            p.done.apply(p, args);
        } else {
            funcs[0].apply(null, args).then(function () {
                funcs.splice(0, 1);
                chain(funcs, arguments).then(function () {
                    p.done.apply(p, arguments);
                });
            });
        }
        return p;
    }

    /*
     * AJAX requests
     */

    function _encode(data) {
        var result = "";
        if (typeof data === "string") {
            result = data;
        } else {
            var e = encodeURIComponent;
            for (var k in data) {
                if (data.hasOwnProperty(k)) {
                    result += '&' + e(k) + '=' + e(data[k]);
                }
            }
        }
        return result;
    }

    function new_xhr() {
        var xhr;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
        } else if (window.ActiveXObject) {
            try {
                xhr = new ActiveXObject("Msxml2.XMLHTTP");
            } catch (e) {
                xhr = new ActiveXObject("Microsoft.XMLHTTP");
            }
        }
        return xhr;
    }


    function ajax(method, url, data, headers) {
        var p = new Promise();
        var xhr, payload;
        data = data || {};
        headers = headers || {};

        try {
            xhr = new_xhr();
        } catch (e) {
            p.done(promise.ENOXHR, "");
            return p;
        }

        payload = _encode(data);
        if (method === 'GET' && payload) {
            url += '?' + payload;
            payload = null;
        }

        xhr.open(method, url);
        xhr.setRequestHeader('Content-type',
                             'application/x-www-form-urlencoded');
        for (var h in headers) {
            if (headers.hasOwnProperty(h)) {
                xhr.setRequestHeader(h, headers[h]);
            }
        }

        function onTimeout() {
            xhr.abort();
            p.done(promise.ETIMEOUT, "", xhr);
        }

        var timeout = promise.ajaxTimeout;
        if (timeout) {
            var tid = setTimeout(onTimeout, timeout);
        }

        xhr.onreadystatechange = function () {
            if (timeout) {
                clearTimeout(tid);
            }
            if (xhr.readyState === 4) {
                var err = (!xhr.status ||
                           (xhr.status < 200 || xhr.status >= 300) &&
                           xhr.status !== 304);
                p.done(err, xhr.responseText, xhr);
            }
        };

        xhr.send(payload);
        return p;
    }

    function _ajaxer(method) {
        return function (url, data, headers) {
            return ajax(method, url, data, headers);
        };
    }

    var promise = {
        Promise: Promise,
        join: join,
        chain: chain,
        ajax: ajax,
        get: _ajaxer('GET'),
        post: _ajaxer('POST'),
        put: _ajaxer('PUT'),
        del: _ajaxer('DELETE'),

        /* Error codes */
        ENOXHR: 1,
        ETIMEOUT: 2,

        /**
         * Configuration parameter: time in milliseconds after which a
         * pending AJAX request is considered unresponsive and is
         * aborted. Useful to deal with bad connectivity (e.g. on a
         * mobile network). A 0 value disables AJAX timeouts.
         *
         * Aborted requests resolve the promise with a ETIMEOUT error
         * code.
         */
        ajaxTimeout: 0
    };

    if (typeof define === 'function' && define.amd) {
        /* AMD support */
        define(function () {
            return promise;
        });
    } else {
        exports.promise = promise;
    }

})(this);
},{}],3:[function(require,module,exports){
talkify = talkify || {};
talkify.http = (function ajax() {

    var get = function(url) {
        var call = new promise.Promise();

        promise
            .get(window.talkify.config.host + url)
            .then(function(error, data) {
                try {
                    var jsonObj = JSON.parse(data);
                    call.done(error, jsonObj);
                } catch (e) {
                    call.done(e, data);
                }

            });

        return call;
    };

    return {
        get: get
    };
})();
},{}],4:[function(require,module,exports){
talkify = talkify || {};
talkify.playbar = function(parent) {
    var settings = {
        parentElement: parent || talkify.config.ui.audioControls.container || document.body
    }

    var playElement, pauseElement, rateElement, volumeElement, progressElement, voiceElement, currentTimeElement, trackTimeElement, textHighlightingElement, timeWrapperElement, controlsWrapperElement, wrapper, voiceWrapperElement;
    var audioSrcElement;

    var events = {
        onPlayClicked: function () { },
        onPauseClicked: function () { },
        onVolumeChanged: function () { },
        onRateChanged: function () { },
        onTextHighlightingClicked: function () { }
    }

    function hide(element) {
        if (element.classList.contains("talkify-hidden")) {
            return;
        }

        element.className += " talkify-hidden";
    }

    function show(element) {
        element.className = element.className.replace("talkify-hidden", "");
    }

    function play() {
        hide(playElement);
        show(pauseElement);
    }

    function pause() {
        hide(pauseElement);
        show(playElement);
    }

    function addClass(element, c) {
        if (element.classList.contains(c)) {
            return;
        }

        element.className += (" " + c);
    }

    function removeClass(element, c) {
        element.className = element.className.replace(c, "");
    }

    function render() {
        var existingControl = document.getElementById("htmlPlaybar");
        if (existingControl) {
            existingControl.parentNode.removeChild(existingControl);
        }

        wrapper = document.createElement("section");
        wrapper.id = "htmlPlaybar";
        wrapper.className = "talkify-audio-control";

        voiceWrapperElement = document.createElement("div");
        voiceWrapperElement.className = "talkify-audio-control-voice-wrapper";
        voiceWrapperElement.textContent = "Speaking:";

        voiceElement = document.createElement("span");

        textHighlightingElement = document.createElement("i");
        textHighlightingElement.className = "fa fa-cc talkify-clickable talkify-disabled";
        textHighlightingElement.title = "Toggle text highlighting (applied for the next paragraph)";

        voiceWrapperElement.appendChild(voiceElement);
        voiceWrapperElement.appendChild(textHighlightingElement);

        timeWrapperElement = document.createElement("div");
        timeWrapperElement.className = "talkify-inline";

        currentTimeElement = document.createElement("span");
        currentTimeElement.id = "talkify-current-track-time";
        currentTimeElement.textContent = "0:00";

        trackTimeElement = document.createElement("span");
        trackTimeElement.id = "talkify-track-time";
        trackTimeElement.textContent = "0:00";

        timeWrapperElement.appendChild(currentTimeElement);
        timeWrapperElement.appendChild(document.createTextNode("/"));
        timeWrapperElement.appendChild(trackTimeElement);

        progressElement = document.createElement("progress");
        progressElement.setAttribute("value", "0.0");
        progressElement.setAttribute("max", "1.0");

        var backElement = document.createElement("i");
        backElement.className = "fa fa-backward fa-2x talkify-clickable";

        playElement = document.createElement("i");
        playElement.className = "fa fa-play-circle fa-2x talkify-clickable talkify-disabled";

        pauseElement = document.createElement("i");
        pauseElement.className = "fa fa-pause fa-2x talkify-clickable talkify-disabled";

        var forwardElement = document.createElement("i");
        forwardElement.className = "fa fa-forward fa-2x talkify-clickable";

        controlsWrapperElement = document.createElement("div");
        controlsWrapperElement.className = "talkify-wrapper talkify-inline";

        var rateIconElement = document.createElement("i");
        rateIconElement.className = "fa fa-tachometer";

        rateElement = document.createElement("input");
        rateElement.setAttribute("type", "range");
        rateElement.setAttribute("value", "5");
        rateElement.setAttribute("min", "0");
        rateElement.setAttribute("max", "10");
        rateElement.setAttribute("title", "Adjust playback speed");

        var volumeIconElement = document.createElement("i");
        volumeIconElement.className = "fa fa-volume-up";

        volumeElement = document.createElement("input");
        volumeElement.setAttribute("type", "range");
        volumeElement.setAttribute("value", "10");
        volumeElement.setAttribute("min", "0");
        volumeElement.setAttribute("max", "10");
        volumeElement.setAttribute("title", "Adjust playback volume");

        wrapper.appendChild(voiceWrapperElement);
        wrapper.appendChild(timeWrapperElement);
        wrapper.appendChild(playElement);
        wrapper.appendChild(pauseElement);

        wrapper.appendChild(progressElement);
        //wrapper.appendChild(backElement);
        //wrapper.appendChild(forwardElement);
        wrapper.appendChild(controlsWrapperElement);
        controlsWrapperElement.appendChild(rateIconElement);
        controlsWrapperElement.appendChild(rateElement);
        controlsWrapperElement.appendChild(volumeIconElement);
        controlsWrapperElement.appendChild(volumeElement);

        settings.parentElement.appendChild(wrapper);

        pause();
    }

    function setupBindings() {
        playElement.addEventListener("click", function () {
            if (playElement.classList.contains("talkify-disabled")) {
                return;
            }

            events.onPlayClicked();
        });

        pauseElement.addEventListener("click", function () {
            if (pauseElement.classList.contains("talkify-disabled")) {
                return;
            }

            events.onPauseClicked();
        });

        rateElement.addEventListener("change", function () {
            events.onRateChanged(parseInt(this.value));
        });

        volumeElement.addEventListener("change", function (e) {
            events.onVolumeChanged(parseInt(this.value));
        });

        textHighlightingElement.addEventListener("click", function (e) {
            if (textHighlightingElement.classList.contains("talkify-disabled")) {
                removeClass(textHighlightingElement, "talkify-disabled");
            } else {
                addClass(textHighlightingElement, "talkify-disabled");
            }

            events.onTextHighlightingClicked();
        });
    }

    function initialize() {
        render();
        setupBindings();
    };

    function updateClock(e) {
        progressElement.setAttribute("value", e.target.currentTime / e.target.duration);

        var current = document.getElementById("talkify-current-track-time");

        if (!current) {
            return;
        }

        var total = document.getElementById("talkify-track-time");

        var minutes = Math.floor(e.target.currentTime / 60);
        var seconds = Math.round(e.target.currentTime) - (minutes * 60);

        current.textContent = minutes + ":" + ((seconds < 10) ? "0" + seconds : seconds);

        minutes = !!e.target.duration ? Math.floor(e.target.duration / 60) : 0;
        seconds = !!e.target.duration ? Math.round(e.target.duration) - (minutes * 60) : 0;

        total.textContent = minutes + ":" + ((seconds < 10) ? "0" + seconds : seconds);
    }

    function listenToAudioSrc(src) {
        if (!(src instanceof Node)) {
            return;
        }

        audioSrcElement = src;

        audioSrcElement.addEventListener("timeupdate", updateClock, false);
    }

    function arrangeControlsWhenProgressIsUnsupported() {
        wrapper.insertBefore(voiceWrapperElement, controlsWrapperElement);
        addClass(voiceWrapperElement, "talkify-inline");
    }

    function arrangeControlsWhenProgressIsSupported() {
        wrapper.insertBefore(voiceWrapperElement, timeWrapperElement);
        removeClass(voiceWrapperElement, "talkify-inline");
        show(voiceWrapperElement);
    }

    function isTalkifyHostedVoice(voice) {
        return voice && voice.isTalkify;
    }

    function featureToggle(voice) {
        show(progressElement);
        arrangeControlsWhenProgressIsSupported();
        show(textHighlightingElement);

        if (!voice) {
            return;
        }

        if (isTalkifyHostedVoice(voice)) {
            return;
        }

        hide(timeWrapperElement);

        if (!voice.localService) {
            hide(progressElement);
            arrangeControlsWhenProgressIsUnsupported();
            hide(textHighlightingElement);
        }
    }

    function setVoiceName(voice) {
        if (!voice) {
            voiceElement.textContent = "Automatic voice detection";
            return;
        }

        if (isTalkifyHostedVoice(voice)) {
            voiceElement.textContent = voice.description;
            return;
        }

        voiceElement.textContent = voice.name;
    }

    initialize();

    return {
        subscribeTo: function (subscriptions) {
            events.onPauseClicked = subscriptions.onPauseClicked || events.onPauseClicked;
            events.onPlayClicked = subscriptions.onPlayClicked || events.onPlayClicked;
            events.onRateChanged = subscriptions.onRateChanged || events.onRateChanged;
            events.onVolumeChanged = subscriptions.onVolumeChanged || events.onVolumeChanged;
            events.onTextHighlightingClicked = subscriptions.onTextHighlightingClicked || events.onTextHighlightingClicked;
            return this;
        },
        setRate: function (value) {
            rateElement.setAttribute("value", value);
            return this;
        },
        setMaxRate: function (value) {
            rateElement.setAttribute("max", value);
            return this;
        },
        setMinRate: function (value) {
            rateElement.setAttribute("min", value);
            return this;
        },
        audioLoaded: function () {
            removeClass(pauseElement, "talkify-disabled");
            removeClass(playElement, "talkify-disabled");
        },
        markAsPaused: pause,
        markAsPlaying: play,
        setTextHighlight: function (enabled) {
            if (enabled) {
                removeClass(textHighlightingElement, "talkify-disabled");
                return;
            }

            addClass(textHighlightingElement, "talkify-disabled");
        },
        setProgress: function (value) {
            progressElement.setAttribute("value", value);
        },
        setVoice: function (voice) {
            featureToggle(voice);
            setVoiceName(voice);

            return this;
        },
        setAudioSource: function (src) {
            listenToAudioSrc(src);
        },
        dispose: function () {
            var existingControl = document.getElementById("htmlPlaybar");

            if (existingControl) {
                existingControl.parentNode.removeChild(existingControl);
            }

            if (audioSrcElement) {
                audioSrcElement.removeEventListener("timeupdate", updateClock);
            }
        }
    }
}
},{}],5:[function(require,module,exports){
talkify = talkify || {};
talkify.config = {
    host: 'http://talkify.net',
    useRemoteServices: true,
    ui:
    {
        audioControls: {
            enabled: false,
            container: document.body
        }
    }
}
},{}],6:[function(require,module,exports){
//TODO: Verify all events. Especially for this player. Trigger play, pause, stop and add console outputs and see what happens
talkify = talkify || {};

talkify.Html5Player = function () {
    this.isStopped = false;
    this.volume = 1;

    this.currentContext = {
        item: null,
        endedCallback: function () { },
        utterances: [],
        currentUtterance: null
    };

    var me = this;

    this.playbar = {
        instance: null
    };

    this.audioSource = {
        play: function () {
            if (me.currentContext.item) {
                playCurrentContext();
            }
        },
        pause: function () {
            window.speechSynthesis.pause();

            me.internalEvents.onPause();
        },
        ended: function () { return !window.speechSynthesis.speaking; },
        isPlaying: function () { return window.speechSynthesis.speaking; },
        paused: function () { return !window.speechSynthesis.speaking; },
        currentTime: function () { return 0; },
        cancel: function (asPause) {
            if (asPause) {
                stop();
            } else {
                window.speechSynthesis.cancel();
            }
        },
        stop: function () {
            stop();
        },
        dispose: function () { }
    };

    talkify.BasePlayer.call(this, this.audioSource, this.playbar);

    this.playAudio = function (item, onEnded) {
        me.currentContext.endedCallback = onEnded;
        me.currentContext.item = item;
        me.currentContext.utterances = [];
        me.currentContext.currentUtterance = null;
        me.mutateControls(function (instance) {
            instance.audioLoaded();
        });

        //if (me.settings.lockedLanguage !== null) {
        return playCurrentContext();
        //}

        //TODO: Need better server side help here with refLang
        //var p = new promise.Promise();

        //talkifyHttp.get("/api/Language?text=" + item.text)
        //    .then(function (error, data) {
        //        me.settings.referenceLanguage = data;

        //        me.playCurrentContext().then(function () {
        //            p.done();
        //        });
        //    });

        //return p;
    };

    this.setVolume = function (volume) {
        me.volume = volume;

        return this;
    };

    this.mutateControls(function (c) {
        c.subscribeTo({
            onPlayClicked: function () {
                me.audioSource.play();
            },
            onPauseClicked: function () {
                me.pause();
            },
            onVolumeChanged: function (volume) {
                me.volume = volume / 10;
            },
            onRateChanged: function (rate) {
                me.settings.rate = rate / 5;
            }
        }).setVoice(me.forcedVoice);
    });

    function playCurrentContext() {
        var item = me.currentContext.item;
        var onEnded = me.currentContext.endedCallback;

        var chuncks = chunckText(item.text);

        me.currentContext.utterances = [];
        me.isStopped = false;

        chuncks.forEach(function (chunck) {
            var utterance = new window.SpeechSynthesisUtterance();

            utterance.text = chunck;
            utterance.lang = me.settings.lockedLanguage || me.settings.referenceLanguage.Culture;
            utterance.rate = me.settings.rate;
            utterance.volume = me.volume;

            me.currentContext.utterances.push(utterance);
        });

        var p = new promise.Promise();

        var wordIndex = 0;
        var previousCharIndex = 0;
        var words = extractWords(item.text);

        me.currentContext.utterances[me.currentContext.utterances.length - 1].onend = function (e) {
            me.events.onSentenceComplete(item);

            if (!me.currentContext.currentUtterance) {
                return;
            }

            if (me.currentContext.currentUtterance.text !== e.currentTarget.text) {
                return;
            }

            if (onEnded && !me.isStopped) {
                onEnded();
            }
        };

        me.currentContext.utterances.forEach(function (u, index) {
            if (index === 0) {
                u.onstart = function (e) {
                    me.currentContext.currentUtterance = e.utterance;
                    p.done();
                    me.internalEvents.onPlay();
                };
            } else {
                u.onstart = function (e) {
                    me.currentContext.currentUtterance = e.utterance;
                };
            }

            u.onpause = function () {
                me.internalEvents.onPause();
            };

            u.onresume = function () { };

            u.onboundary = function (e) {
                if (e.name !== "word" || !words[wordIndex]) {
                    return;
                }

                me.mutateControls(function (c) {
                    c.setProgress((wordIndex + 1) / words.length);
                });

                if (!me.settings.useTextHighlight || !u.voice.localService) {
                    return;
                }


                //if (!words[wordIndex]) {
                //    return;
                //}

                var fromIndex = 0;

                for (var k = 0; k < wordIndex; k++) {
                    fromIndex += words[k].length + 1;
                }

                var isCommaOrSimilair = previousCharIndex + 1 === e.charIndex;

                if (isCommaOrSimilair) {
                    previousCharIndex = e.charIndex;
                    return;
                }

                me.wordHighlighter.highlight(item, words[wordIndex], fromIndex);
                wordIndex++;
                previousCharIndex = e.charIndex;
            };

            getVoice().then(function (voice) {
                if (words.length && me.settings.useTextHighlight && voice.localService) {
                    me.wordHighlighter.highlight(item, words[0], 0);
                }

                u.voice = voice;

                console.log(u); //Keep this, speech bugs out otherwise

                window.speechSynthesis.cancel();

                me.mutateControls(function (c) {
                    c.setVoice(voice);
                });

                window.setTimeout(function () {
                    window.speechSynthesis.speak(u);
                }, 100);
            });
        });

        return p;
    };

    function chunckText(text) {
        var language = me.settings.lockedLanguage || me.settings.referenceLanguage.Culture;
        var chunckSize = language.indexOf('zh-') > -1 ? 70 :
            language.indexOf('ko-') > -1 ? 130 : 200;

        var chuncks = [];
        var sentences = text.split(/(\?|\.|。)+/g); //('.');
        var currentChunck = '';

        sentences.forEach(function (sentence) {
            if (sentence === '' || sentence === '.' || sentence === '。' || sentence === '?') {
                if (currentChunck) {
                    currentChunck += sentence;
                }

                return;
            }

            if (currentChunck && ((currentChunck.length + sentence.length) > chunckSize)) {
                chuncks.push(currentChunck);
                currentChunck = '';
            }

            if (sentence.length > chunckSize) {
                var words = extractWords(sentence, language);

                words.forEach(function (word) {
                    if (currentChunck.length + word.length > chunckSize) {
                        chuncks.push(currentChunck);
                        currentChunck = '';
                    }

                    currentChunck += word.trim() + ' ';
                });

                if (currentChunck.trim()) {
                    chuncks.push(currentChunck.trim() + '.');
                    currentChunck = '';
                }

                return;
            }

            currentChunck += sentence;
        });

        chuncks.push(currentChunck);

        return chuncks;
    };

    function extractWords(text, language) {
        var wordRegex = new RegExp(/[&\$\-|]|([("\-&])*(\b[^\s]+[.:,"-)!&?]*)/g);

        if (language) {
            if (language.indexOf('zh-') > -1) {
                return text.split('，');
            }

            if (language.indexOf('ko-') > -1) {
                return text.split('.');
            }
        }

        var words = [];
        var m;

        while ((m = wordRegex.exec(text)) !== null) {
            if (m.index === wordRegex.lastIndex) {
                wordRegex.lastIndex++;
            }

            words.push(m[0]);
        }

        return words;
    };

    function selectVoiceToPlay(voices) {
        var matchingVoices = [];
        var voice = null;

        var language = me.settings.lockedLanguage || me.settings.referenceLanguage.Culture;

        for (var i = 0; i < voices.length; i++) {
            if (voices[i].lang === language) {
                matchingVoices.push(voices[i]);
                voice = voices[i];
            }
        }

        for (var j = 0; j < matchingVoices.length; j++) {
            if (matchingVoices[j].localService) {
                voice = matchingVoices[j];

                break;
            }
        }

        if (!voice && matchingVoices.length) {
            voice = matchingVoices[0];
        }

        if (!voice && voices.length) {
            voice = voices[0];
        }

        return voice;
    };

    function getVoice() {
        var p = new promise.Promise();

        if (me.forcedVoice) {
            p.done(me.forcedVoice);

            return p;
        }

        if (window.speechSynthesis.getVoices().length) {
            var voices = window.speechSynthesis.getVoices();

            p.done(selectVoiceToPlay(voices));

            return p;
        }

        window.speechSynthesis.onvoiceschanged = function () {
            var voices = window.speechSynthesis.getVoices();

            p.done(selectVoiceToPlay(voices));
        };

        return p;
    };

    function stop() {
        me.isStopped = true;
        me.internalEvents.onPause();
        window.speechSynthesis.cancel();

        if (me.currentContext.utterances.indexOf(me.currentContext.currentUtterance) < me.currentContext.utterances.length - 1) {
            console.log('Not the last, finishing anyway...');
            me.events.onSentenceComplete(me.currentContext.item);
        }
    };
};

talkify.Html5Player.prototype.constructor = talkify.Html5Player;
},{}],7:[function(require,module,exports){
talkify = talkify || {};
talkify.BasePlayer = function (_audiosource, _playbar) {
    this.audioSource = _audiosource;
    this.wordHighlighter = new talkify.wordHighlighter();
    var me = this;

    this.settings = {
        useTextHighlight: false,
        referenceLanguage: { Culture: "", Language: -1 },
        lockedLanguage: null,
        rate: 1,
        useControls: false
    };

    this.playbar = _playbar;
    this.forcedVoice = null;

    this.events = {
        onBeforeItemPlaying: function () { },
        onItemLoaded: function () { },
        onSentenceComplete: function () { },
        onPause: function () { },
        onPlay: function () { },
        onResume: function () { },
        onTextHighligtChanged: function () { }
    };

    this.internalEvents = {
        onPause: function () {
            //me.wordHighlighter.pause();
            me.mutateControls(function (c) {
                c.markAsPaused();
            });
            //me.playbar.markAsPaused();

            if (!me.audioSource.ended && me.audioSource.currentTime() > 0) {
                me.events.onPause();
            }
        },
        onPlay: function () {
            //me.wordHighlighter.resume();
            me.mutateControls(function (c) {
                c.markAsPlaying();
            });

            if (me.audioSource.currentTime() > 0) {
                me.events.onResume();
            } else {
                me.events.onPlay();
            }
        },
        onStop: function () {
            me.mutateControls(function (c) {
                c.markAsPaused();
            });
        }
    };

    this.mutateControls = function (mutator) {
        if (this.playbar.instance) {
            mutator(this.playbar.instance);
        }
    }

    if (talkify.config.ui.audioControls.enabled) {
        this.playbar.instance = talkify.playbar().subscribeTo({
            onTextHighlightingClicked: function () {
                me.settings.useTextHighlight = !me.settings.useTextHighlight;
                me.events.onTextHighligtChanged(me.settings.useTextHighlight);
            }
        });
    }

    this.withReferenceLanguage = function (refLang) {
        this.settings.referenceLanguage = refLang;

        return this;
    };

    this.enableTextHighlighting = function () {
        this.settings.useTextHighlight = true;
        this.mutateControls(function (c) {
            c.setTextHighlight(true);
        });

        return this;
    };

    this.disableTextHighlighting = function () {
        this.settings.useTextHighlight = false;
        this.mutateControls(function (c) {
            c.setTextHighlight(false);
        });

        return this;
    };

    this.setRate = function (r) {
        this.settings.rate = r;

        return this;
    }

    this.subscribeTo = function (subscriptions) {
        this.events.onBeforeItemPlaying = subscriptions.onBeforeItemPlaying || function () { };
        this.events.onSentenceComplete = subscriptions.onItemFinished || function () { };
        this.events.onPause = subscriptions.onPause || function () { };
        this.events.onPlay = subscriptions.onPlay || function () { };
        this.events.onResume = subscriptions.onResume || function () { };
        this.events.onItemLoaded = subscriptions.onItemLoaded || function () { };
        this.events.onTextHighligtChanged = subscriptions.onTextHighligtChanged || function () { };

        return this;
    };

    this.generateGuid = function () {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    this.playItem = function (item) {
        var p = new promise.Promise();

        if (item && item.isPlaying) {
            if (this.audioSource.paused()) {
                this.audioSource.play();
            } else {
                this.audioSource.pause();
            }

            return p;
        }

        this.events.onBeforeItemPlaying(item);

        var me = this;

        item.isLoading = true;
        item.isPlaying = true;
        item.element.classList.add("playing");

        this.playAudio(item, function () {
            item.isPlaying = false;
            p.done();
        })
            .then(function () {
                item.isLoading = false;
                me.events.onItemLoaded();
            });

        return p;
    };

    this.createItems = function (text) {
        var safeMaxQuerystringLength = 1000;

        var items = [];

        //TODO: Smart split, should really split at the first end of sentence (.) that is < safeLength
        if (text.length > safeMaxQuerystringLength) {
            var f = text.substr(0, safeMaxQuerystringLength);

            items.push(template(f));

            items = items.concat(this.createItems(text.substr(safeMaxQuerystringLength, text.length - 1)));

            return items;
        }

        items.push(template(text));

        return items;

        function template(t) {
            //Null-objects
            var element = document.createElement("span");
            var clone = element.cloneNode(true);

            return {
                text: t,
                preview: t.substr(0, 40),
                element: element,
                originalElement: clone,
                isPlaying: false,
                isLoading: false
            };
        }
    };

    this.playText = function (text) {
        var items = this.createItems(text);

        var currentItem = 0;

        var next = function () {
            currentItem++;

            if (currentItem >= items.length) {
                return;
            }

            this.playItem(items[currentItem])
                .then(next);
        };

        this.playItem(items[currentItem])
            .then(next);
    };

    this.paused = function () {
        return this.audioSource.paused();
    };

    this.isPlaying = function () {
        return this.audioSource.isPlaying();
    };

    this.play = function () {
        this.audioSource.play();
    };

    this.pause = function () {
        this.audioSource.pause();
        var me = this;

        if (!me.audioSource.paused() && me.audioSource.cancel) {
            me.audioSource.cancel(true);
        }
    };

    this.dispose = function () {
        this.wordHighlighter.cancel();
        this.audioSource.stop();
        this.internalEvents.onStop();

        this.mutateControls(function (c) {
            c.dispose();
        });

        this.audioSource.dispose();
    };

    this.forceLanguage = function (culture) {
        this.settings.lockedLanguage = culture;

        return this;
    };

    this.forceVoice = function (voice) {
        this.forcedVoice = voice !== undefined ? voice : null;

        this.settings.lockedLanguage = (voice && (voice.lang || voice.culture)) || this.settings.lockedLanguage;

        this.mutateControls(function (c) {
            c.setVoice(voice);
        });

        return this;
    };

    this.id = this.generateGuid();
};
},{}],8:[function(require,module,exports){
talkify = talkify || {};

talkify.TtsPlayer = function () {
    if (!talkify.config.useRemoteServices) {
        throw "This player needs to communicate to a remote service. To enable this player please set flag talkify.config.useRemoteServices to true.";
    }

    var me = this;
    var audioElement;

    this.currentContext = {
        item: null,
        positions: []
    };

    this.playbar = {
        instance: null
    };

    this.audioSource = {
        play: function () {
            audioElement.play();
        },
        pause: function () {
            audioElement.pause();
        },
        isPlaying: function () {
            return audioElement.duration > 0 && !audioElement.paused;
        },
        paused: function () { return audioElement.paused; },
        currentTime: function () { return audioElement.currentTime; },
        stop: function () {
            audioElement.pause();
            audioElement.currentTime = 0;
        },
        dispose: function () {
            var existingElement = document.getElementById("talkify-audio");

            if (existingElement) {
                existingElement.outerHTML = "";
            }
        }
    };

    talkify.BasePlayer.call(this, this.audioSource, this.playbar);

    function setupBindings() {
        audioElement.addEventListener("pause", onPause);
        audioElement.addEventListener("play", onPlay);
    }

    function onPause() {
        me.internalEvents.onPause();
        me.wordHighlighter.pause();
    }

    function onPlay() {
        me.internalEvents.onPlay();

        if (!me.currentContext.positions.length) {
            return;
        }

        if (me.audioSource.currentTime() > 0.1) {
            me.wordHighlighter.resume();
        } else {
            var interval = setInterval(function () {
                if (me.audioSource.currentTime() > 0) {
                    clearInterval(interval);

                    me.wordHighlighter
                        .start(me.currentContext.item, me.currentContext.positions)
                        .then(function (completedItem) {
                            me.events.onSentenceComplete(completedItem);
                        });
                }
            }, 20);
        }
    }

    function initialize() {
        audioElement = null;
        var existingElement = document.getElementById("talkify-audio");

        if (existingElement) {
            existingElement.outerHTML = "";
        }

        var mp3Source = document.createElement("source");
        var wavSource = document.createElement("source");
        audioElement = document.createElement("audio");

        audioElement.appendChild(mp3Source);
        audioElement.appendChild(wavSource);

        mp3Source.type = "audio/mpeg";
        wavSource.type = "audio/wav";
        audioElement.id = "talkify-audio";
        audioElement.controls = !talkify.config.ui.audioControls.enabled;
        audioElement.autoplay = false;

        document.body.appendChild(audioElement);

        var clonedAudio = audioElement.cloneNode(true);
        audioElement.parentNode.replaceChild(clonedAudio, audioElement);

        audioElement = clonedAudio;

        me.mutateControls(function () {
            me.playbar.instance.subscribeTo({
                onPlayClicked: function () {
                    me.play();
                },
                onPauseClicked: function () {
                    audioElement.pause();
                },
                onVolumeChanged: function (volume) {
                    audioElement.volume = volume / 10;
                },
                onRateChanged: function (rate) {
                    me.settings.rate = rate;
                }
            })
                .setRate(1)
                .setMinRate(1)
                .setMaxRate(3)
                .setVoice(me.forcedVoice)
                .setAudioSource(audioElement);
        });
    }

    function getPositions() {
        var p = new promise.Promise();

        talkify.http.get("/api/Speak/GetPositions?id=" + me.id)
            .then(function (error, positions) {
                p.done(null, positions);
            });

        return p;
    };

    initialize.apply(this);

    this.playAudio = function (item, onEnded) {
        me.currentContext.item = item;
        me.currentContext.positions = [];
        me.wordHighlighter.cancel();

        var p = new promise.Promise();

        var sources = audioElement.getElementsByTagName("source");

        var textToPlay = encodeURIComponent(item.text.replace(/\n/g, " "));
        var voice = this.forcedVoice ? this.forcedVoice.name : "";

        sources[0].src = talkify.config.host + "/api/Speak?format=mp3&text=" + textToPlay + "&refLang=" + this.settings.referenceLanguage.Language + "&id=" + this.id + "&voice=" + (voice) + "&rate=" + this.settings.rate;
        sources[1].src = talkify.config.host + "/api/Speak?format=wav&text=" + textToPlay + "&refLang=" + this.settings.referenceLanguage.Language + "&id=" + this.id + "&voice=" + (voice) + "&rate=" + this.settings.rate;

        audioElement.load();

        //TODO: remove jquery dependency

        audioElement.onloadeddata = function () {
            me.mutateControls(function (instance) {
                instance.audioLoaded();
            });

            me.audioSource.pause();

            if (!me.settings.useTextHighlight) {
                p.done();
                me.audioSource.play();
                return;
            }

            getPositions().then(function (error, positions) {
                me.currentContext.positions = positions || [];

                p.done();
                me.audioSource.play();
            });
        };

        audioElement.onended = onEnded || function () { };

        return p;
    };

    setupBindings();
};

talkify.TtsPlayer.prototype.constructor = talkify.TtsPlayer;
},{}],9:[function(require,module,exports){
talkify = talkify || {};
talkify.playlist = function () {
    var defaults = {
        useGui: false,
        useTextInteraction: false,
        domElements: [],
        rootSelector: "body",
        events: {
            onEnded: null
        }
    };

    var s = JSON.parse(JSON.stringify(defaults));

    var p = null;

    function isSupported() {
        var a = document.createElement("audio");

        return (typeof a.canPlayType === "function" && (a.canPlayType("audio/mpeg") !== "" || a.canPlayType("audio/wav") !== ""));
    }

    function implementation(_settings, player) {

        var textextractor = new talkify.textextractor();

        var playlist = {
            queue: [],
            currentlyPlaying: null,
            refrenceText: "",
            referenceLanguage: { Culture: '', Language: -1 }
        };

        var settings = _settings;
        var playerHasBeenReplaced = false;

        function reset() {
            playlist.queue = [];
            player.withReferenceLanguage({ Culture: '', Language: -1 });
            playlist.currentlyPlaying = null;
            playlist.refrenceText = "";
        }

        function insertAt(index, items) {
            playlist.queue = playlist.queue.slice(0, index)
                .concat(items)
                .concat(playlist.queue.slice(index));
        }

        function push(items) {
            playlist.queue = playlist.queue.concat(items);
        }

        function resetPlaybackStates() {
            for (var j = 0; j < playlist.queue.length; j++) {
                var item = playlist.queue[j];

                //TODO: Call player.resetItem?
                item.isPlaying = false;
                item.isLoading = false;
                item.element.classList.remove("playing");
            }
        };

        function isPlaying() {
            for (var i = 0; i < playlist.queue.length; i++) {
                if (playlist.queue[i].isPlaying) {
                    return true;
                }
            }

            return false;
        }

        function domElementExistsInQueue(element) { //TODO: might need to look at construct as <a><h3></h3></a> and whether "a" is "h3" since it is just a wrapper
            for (var j = 0; j < playlist.queue.length; j++) {
                var item = playlist.queue[j];

                if (!item) {
                    continue;
                }

                if (element === item.element) {
                    return true;
                }
            }

            return false;
        }

        function playItem(item) {
            var p = new promise.Promise();

            if (!playerHasBeenReplaced && item && item.isPlaying) {
                if (player.paused()) {
                    player.play();
                } else {
                    player.pause();
                }

                return p;
            }

            playerHasBeenReplaced = false;

            resetPlaybackStates();

            if (playlist.currentlyPlaying) {
                playlist.currentlyPlaying.element.innerHTML = playlist.currentlyPlaying.originalElement.innerHTML;
            }

            playlist.currentlyPlaying = item;

            p = player.playItem(item);

            return p;
        };

        function createItems(text, element) {
            var safeMaxQuerystringLength = 1000;

            var items = [];

            if (text.length > safeMaxQuerystringLength) {
                var breakAt = text.substr(0, safeMaxQuerystringLength).lastIndexOf('.'); //TODO: What about ckj characters?

                breakAt = breakAt > -1 ? breakAt : safeMaxQuerystringLength;

                var f = text.substr(0, breakAt);

                items.push(template(f, element));

                items = items.concat(createItems(text.substr(breakAt, text.length - 1), element));

                return items;
            }

            items.push(template(text, element));

            return items;

            function template(t, el) {
                el = el || document.createElement("span");
                var clone = el.cloneNode(true);

                return {
                    text: t,
                    preview: t.substr(0, 40),
                    element: el,
                    originalElement: clone,
                    isPlaying: false,
                    isLoading: false
                };
            }
        }

        function play(item) {
            if (!item) {
                if (playlist.queue.length === 0) {
                    return;
                }

                playFromBeginning();

                return;
            }

            continueWithNext(item);
        }

        function pause() {
            player.pause();
        }

        function setupItemForUserInteraction(item) {
            item.element.style.cursor = "pointer";
            item.element.classList.add("talkify-highlight");

            removeEventListeners("click", item.element);
            addEventListener("click", item.element, textInteractionEventListener);

            function textInteractionEventListener() {
                play(item);
            }
        }

        function removeUserInteractionForItem(item) {
            item.element.style.cursor = "inherit";
            item.element.classList.remove("talkify-highlight");

            removeEventListeners("click", item.element);
        }

        function initialize() {
            reset();

            if (!settings.domElements || settings.domElements.length === 0) {
                settings.domElements = textextractor.extract(settings.rootSelector);
            }

            for (var i = 0; i < settings.domElements.length; i++) {
                var text;
                var element = null;

                if (typeof settings.domElements[i] === "string") {
                    text = settings.domElements[i];
                } else {
                    element = settings.domElements[i];
                    text = element.innerText.trim();
                }

                if (text === "") {
                    continue;
                }

                push(createItems(text, element));

                if (text.length > playlist.refrenceText.length) {
                    playlist.refrenceText = text;
                }
            }

            if (settings.useTextInteraction) {
                for (var j = 0; j < playlist.queue.length; j++) {
                    var item = playlist.queue[j];

                    if (j > 0) {
                        var isSameAsPrevious = item.element === playlist.queue[j - 1].element;

                        if (isSameAsPrevious) {
                            continue;
                        }
                    }

                    setupItemForUserInteraction(item);
                }
            }
        }

        function continueWithNext(currentItem) {
            var next = function (completed) {

                if (completed) {
                    settings.events.onEnded();
                    resetPlaybackStates();
                    return;
                }

                playNext().then(next);
            };

            playItem(currentItem).then(next);
        }

        function getNextItem() {
            var currentQueuePosition = playlist.queue.indexOf(playlist.currentlyPlaying);

            if (currentQueuePosition === playlist.queue.length - 1) {
                return null;
            }

            return playlist.queue[currentQueuePosition + 1];
        }

        function playFromBeginning() {
            if (!talkify.config.useRemoteServices) {
                onComplete({ Culture: '', Language: -1 });

                return;
            }

            talkify.http.get("/api/Language?text=" + playlist.refrenceText)
                .then(function (error, data) {
                    if (error) {
                        onComplete({ Culture: '', Language: -1 });

                        return;
                    }

                    onComplete(data);
                });

            function onComplete(refLang) {
                playlist.referenceLanguage = refLang;
                player.withReferenceLanguage(refLang);

                continueWithNext(playlist.queue[0]);
            }
        }

        function playNext() {
            var p = new promise.Promise();

            var item = getNextItem();

            if (!item) {
                p.done("Completed");

                return p;
            }

            return playItem(item);
        }

        function insertElement(element) {
            var items = [];

            var text = element.innerText;

            if (text.trim() === "") {
                return items;
            }

            if (domElementExistsInQueue(element)) {
                return items;
            }

            var documentPositionFollowing = 4;

            for (var j = 0; j < playlist.queue.length; j++) {
                var item = playlist.queue[j];

                var isSelectionAfterQueueItem = element.compareDocumentPosition(item.element) == documentPositionFollowing;

                if (isSelectionAfterQueueItem) {
                    var queueItems = createItems(text, element);

                    insertAt(j, queueItems);

                    items = items.concat(queueItems);

                    break;
                }

                var shouldAddToBottom = j === playlist.queue.length - 1;

                if (shouldAddToBottom) {
                    var qItems = createItems(text, element);

                    push(qItems);

                    items = items.concat(qItems);

                    break;;
                }
            }

            return items;
        }

        function replayCurrent() {
            if (!playlist.currentlyPlaying) {
                return;
            }

            playlist.currentlyPlaying.isPlaying = false;
            play(playlist.currentlyPlaying);
        }

        //TODO: Extract and reuse?
        function removeEventListeners(eventType, element) {
            if (!element.trackedEvents || !element.trackedEvents[eventType]) {
                return;
            }

            for (var i = 0; i < element.trackedEvents[eventType].length; i++) {
                element.removeEventListener(eventType, element.trackedEvents[eventType][i]);
            }
        }

        function addEventListener(eventType, element, listener) {
            if (!element.trackedEvents) {
                element.trackedEvents = [];
            }

            if (!element.trackedEvents[eventType]) {
                element.trackedEvents[eventType] = [];
            }

            element.trackedEvents[eventType].push(listener);
            element.addEventListener(eventType, listener);
        }

        initialize();

        return {
            getQueue: function () { return playlist.queue; },
            play: play,
            pause: pause,
            replayCurrent: replayCurrent,
            insert: insertElement,
            isPlaying: isPlaying,
            enableTextInteraction: function () {
                settings.useTextInteraction = true;

                for (var i = 0; i < playlist.queue.length; i++) {
                    setupItemForUserInteraction(playlist.queue[i]);
                }
            },
            disableTextInteraction: function () {
                settings.useTextInteraction = false;

                for (var i = 0; i < playlist.queue.length; i++) {
                    removeUserInteractionForItem(playlist.queue[i]);
                }
            },
            setPlayer: function (p) {
                player = p;
                player.withReferenceLanguage(playlist.referenceLanguage);
                playerHasBeenReplaced = true;
                replayCurrent();
            },
            dispose: function () {
                resetPlaybackStates();
            }
        }
    }

    return {
        begin: function () {
            s = JSON.parse(JSON.stringify(defaults));
            p = null;

            return {
                withTextInteraction: function () {
                    s.useTextInteraction = true;

                    return this;
                },
                withTalkifyUi: function () {
                    s.useGui = true;

                    return this;
                },
                withRootSelector: function (rootSelector) {
                    s.rootSelector = rootSelector;

                    return this;
                },
                withElements: function (elements) {
                    s.domElements = elements;

                    return this;
                },
                usingPlayer: function (player) {
                    p = player;

                    return this;
                },
                subscribeTo: function (events) {
                    s.events.onEnded = events.onEnded || function () { };

                    return this;
                },
                build: function () {
                    if (!isSupported()) {
                        throw new Error("Not supported. The browser needs to support mp3 or wav HTML5 Audio.");
                    }

                    if (!p) {
                        throw new Error("A player must be provided. Please use the 'usingPlayer' method to provide one.");
                    }

                    s.events.onEnded = s.events.onEnded || function () { };

                    return new implementation(s, p);
                }
            }
        }

    };
};
},{}],10:[function(require,module,exports){
talkify = talkify || {};
talkify.textextractor = function () {
    var validElements = [];

    var inlineElements = ['a', 'span', 'b', 'big', 'i', 'small', 'tt', 'abbr', 'acronym', 'cite', 'code', 'dfn', 'em', 'kbd', 'strong', 'samp', 'var', 'a', 'bdo', 'q', 'sub', 'sup', 'label'];
    var forbiddenElementsString = ['img', 'map', 'object', 'script', 'button', 'input', 'select', 'textarea', 'br', 'style', 'code', 'nav', '#nav', '#navigation', '.nav', '.navigation', 'footer'];

    function getVisible(elements) {
        var result = [];

        for (var j = 0; j < elements.length; j++) {
            if (!isVisible(elements[j])) {
                continue;
            }

            result.push(validElements[j]);
        }

        return result;
    }

    function isVisible(element) {
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }

    function getStrippedText(text) {
        return text.replace(/(\r\n|\n|\r)/gm, "").trim();
    }

    function isValidTextNode(node) {
        if (!node) {
            return false;
        }

        if (node.nodeType === 3) {
            return getStrippedText(node.textContent).length >= 10;
        }

        return false;
    }

    function isValidAnchor(node) {
        var nrOfSiblings = getSiblings(node);

        if (nrOfSiblings.length >= 1) {
            return true;
        }

        var previous = node.previousSibling;

        if (isValidTextNode(previous)) {
            return true;
        }

        if (isValidTextNode(node.nextSibling)) {
            return true;
        }

        return false;
    }

    function isValidForGrouping(node) {
        var isTextNode = node.nodeType === 3;
        var textLength = getStrippedText(node.textContent).length;

        return (isTextNode && textLength >= 5) || elementIsInlineElement(node);
    }

    function getConnectedElements(nodes, firstIndex) {
        var connectedElements = [];

        for (var l = firstIndex; l < nodes.length; l++) {
            if (isValidForGrouping(nodes[l])) {
                connectedElements.push(nodes[l]);
            } else {
                break;
            }
        }

        return connectedElements;
    }

    function group(elements) {
        //TODO: wrap in selectable element
        wrapping = document.createElement('span');
        wrapping.classList.add("superbar");

        for (var j = 0; j < elements.length; j++) {
            wrapping.appendChild(elements[j].cloneNode(true));
        }

        return wrapping;
    }

    function wrapInSelectableElement(node) {
        wrapping = document.createElement('span');
        wrapping.classList.add("foobar");
        wrapping.innerText = node.textContent;
        return wrapping;
    }

    function wrapAndReplace(node) {
        var spanElement = wrapInSelectableElement(node);

        if (node.parentNode) {
            node.parentNode.replaceChild(spanElement, node);
        }

        return spanElement;
    }

    function evaluate(nodes) {
        if (!nodes || nodes.length === 0) {
            return;
        }

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];

            if (elementIsParagraphOrHeader(node)) {
                validElements.push(node);
                continue;
            }

            if (forbiddenElementsString.indexOf(getSafeTagName(node).toLowerCase()) !== -1) {
                var forcedElement = (node.nodeType === 1 ? node : node.parentNode).querySelectorAll('h1, h2, h3, h4');

                for (var k = 0; k < forcedElement.length; k++) {
                    validElements.push(forcedElement[k]);
                }

                continue;
            }

            if (getSafeTagName(node).toLowerCase() === 'a' && !isValidAnchor(node)) {
                continue;
            }

            var connectedElements = getConnectedElements(nodes, i);

            if (connectedElements.length > 1) {
                var wrapping = group(connectedElements);
                var isAboveThreshold = getStrippedText(wrapping.innerText).length >= 20;

                if (isAboveThreshold) {
                    nodes[i].parentNode.replaceChild(wrapping, nodes[i]);

                    for (var j = 0; j < connectedElements.length; j++) {
                        var parentNode = connectedElements[j].parentNode;

                        if (!parentNode) {
                            continue;
                        }

                        connectedElements[j].parentNode.removeChild(connectedElements[j]);
                    }

                    validElements.push(wrapping);

                    continue;
                }
            }

            if (isValidTextNode(node)) {
                validElements.push(wrapAndReplace(node));
            }

            evaluate(node.childNodes);
        }
    }

    function extract(rootSelector) {
        validElements = [];

        var topLevelElements = document.querySelectorAll(rootSelector + ' > ' + generateExcludesFromForbiddenElements());

        var date = new Date();

        for (var i = 0; i < topLevelElements.length; i++) {
            var element = topLevelElements[i];

            if (elementIsParagraphOrHeader(element)) {
                validElements.push(element);

                continue;
            }

            evaluate(topLevelElements[i].childNodes);
        }

        var result = getVisible(validElements);

        console.log(new Date() - date);

        return result;
    }

    function generateExcludesFromForbiddenElements() {
        var result = '*';

        for (var i = 0; i < forbiddenElementsString.length; i++) {
            result += ':not(' + forbiddenElementsString[i] + ')';
        }

        return result;
    }

    function elementIsParagraphOrHeader(element) {
        if (element.nodeType === 3) {
            return false;
        }

        return ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(getSafeTagName(element).toLowerCase()) != -1;
    }

    function elementIsInlineElement(element) {
        if (element.nodeType === 3) {
            return false;
        }

        return inlineElements.indexOf(getSafeTagName(element).toLowerCase()) != -1;
    }

    function getSafeTagName(node) {
        return node.tagName || '';
    }

    function getChildren(n, skipMe) {
        var r = [];
        for (; n; n = n.nextSibling)
            if (n.nodeType == 1 && n != skipMe)
                r.push(n);
        return r;
    };

    function getSiblings(n) {
        if (!n) {
            return [];
        }

        return getChildren(n.parentNode.firstChild, n);
    }

    return {
        extract: extract
    };
};
},{}],11:[function(require,module,exports){
talkify = talkify || {};
talkify.timer = function() {
    var callback, timerId, start, remaining;

    this.pause = function () {
        window.clearTimeout(timerId);
        remaining -= new Date() - start;
    };

    this.resume = function () {
        start = new Date();
        window.clearTimeout(timerId);
        timerId = window.setTimeout(callback, remaining);
    };

    this.cancel = function () {
        window.clearTimeout(timerId);
        callback = null;
    };

    this.start = function (cb, delay) {
        callback = cb;
        remaining = delay;
        timerId = window.setTimeout(callback, remaining);
    };
}
},{}],12:[function(require,module,exports){
talkify = talkify || {};
talkify.wordHighlighter = function() {
    var textHighlightTimer = new talkify.timer();
    var currentItem = null;

    function highlight(item, word, charPosition) {
        resetCurrentItem();

        currentItem = item;
        var text = item.element.innerText.trim();

        if (charPosition === 0) {
            item.element.innerHTML = '<span class="talkify-word-highlight">' + text.substring(0, word.length) + '</span> ' + text.substring(word.length + 1);

            return;
        }

        item.element.innerHTML = text.substring(0, charPosition) + '<span class="talkify-word-highlight">' + text.substring(charPosition, charPosition + word.length) + '</span>' + text.substring(charPosition - 1 + word.length + 1);
    }

    function cancel() {
        textHighlightTimer.cancel();

        resetCurrentItem();
    }

    function setupWordHightlighting(item, positions) {
        var p = new promise.Promise();

        cancel();

        if (!positions.length) {
            return p.done(item);
        }

        var i = 0;

        var internalCallback = function () {
            highlight(item, positions[i].Word, positions[i].CharPosition);

            i++;

            if (i >= positions.length) {
                textHighlightTimer.cancel();

                window.setTimeout(function () {
                    item.element.innerHTML = item.originalElement.innerHTML

                    p.done(item);
                }, 1000);

                return;
            }

            var next = (positions[i].Position - positions[i - 1].Position) + 0;

            textHighlightTimer.cancel();
            textHighlightTimer.start(internalCallback, next);
        };

        internalCallback();

        return p;
    }

    function resetCurrentItem() {
        if (currentItem) {
            currentItem.element.innerHTML = currentItem.originalElement.innerHTML;
        }
    }
    
    return {
        pause: textHighlightTimer.pause,
        resume: textHighlightTimer.resume,
        start: setupWordHightlighting,
        highlight: highlight,
        cancel: cancel
    };
};
},{}],13:[function(require,module,exports){
talkify = {};
},{}]},{},[1]);
