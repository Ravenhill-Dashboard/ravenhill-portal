const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('/Users/danielgicevski/Documents/Antigravity/Ravenhill/driver.html', 'utf8');
const script = fs.readFileSync('/Users/danielgicevski/Documents/Antigravity/Ravenhill/driver.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole: new jsdom.VirtualConsole().sendTo(console) });

// provide fake localStorage
dom.window.localStorage = {
  getItem: (k) => {
    if (k === 'inspections') return JSON.stringify([{id: '123', status: 'In Transit', assignedTransport: 'xv99ss', identifier: 'Test Asset'}]);
    return null;
  },
  setItem: () => {}
};

dom.window.eval(script);

const regInput = dom.window.document.getElementById('reg-input');
regInput.value = 'XV99SS';

const form = dom.window.document.getElementById('driver-login-form');
form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

console.log("Login View Display:", dom.window.document.getElementById('login-view').style.display);
console.log("Manifest View Display:", dom.window.document.getElementById('manifest-view').style.display);
console.log("Manifest List HTML:", dom.window.document.getElementById('manifest-list').innerHTML.trim());

