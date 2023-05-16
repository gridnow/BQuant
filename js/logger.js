const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _error = console.log.bind(console);
var moment = require('moment')
moment.locale('zh-cn')

function formatTime() {
    return moment().format('YYYY-MM-DD HH:mm:ss.ms')
}

console.log = function(...args) {
    _log("[LOG  ][", formatTime(), "]", ...args);
};

console.warn = function(...args) {
    _warn("[WARN ][", formatTime(), "]", ...args);
};

console.error = function(...args) {
    _error("[ERROR][", formatTime(), "]", ...args);
};

