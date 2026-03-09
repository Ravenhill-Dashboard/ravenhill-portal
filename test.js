const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('/Users/danielgicevski/Documents/Antigravity/Ravenhill/index.html', 'utf8');
const script = fs.readFileSync('/Users/danielgicevski/Documents/Antigravity/Ravenhill/app.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only" });
dom.window.eval(script);

dom.window.navigate('transports');
console.log("Transports HTML before submit:\n", dom.window.document.getElementById('content-area').innerHTML);

const regInput = dom.window.document.getElementById('transport-reg');
regInput.value = 'XV99SS';

const form = dom.window.document.getElementById('transport-form');
form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));

console.log("Transports HTML after submit:\n", dom.window.document.getElementById('content-area').innerHTML);
console.log("AppState.transports:", dom.window.AppState.transports);
