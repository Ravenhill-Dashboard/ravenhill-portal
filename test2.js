const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('/Users/danielgicevski/Documents/Antigravity/Ravenhill/index.html', 'utf8');
const script = fs.readFileSync('/Users/danielgicevski/Documents/Antigravity/Ravenhill/app.js', 'utf8');

const dom = new JSDOM(html, { runScripts: "outside-only", virtualConsole: new jsdom.VirtualConsole().sendTo(console) });
dom.window.eval(script);

dom.window.navigate('transports');
const regInput = dom.window.document.getElementById('transport-reg');
if (regInput) {
  regInput.value = 'XV99SS';
  const form = dom.window.document.getElementById('transport-form');
  // Trigger submit handler directly to ensure it fires since we don't have a full browser event loop
  const event = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  
  console.log("Transports:", dom.window.AppState.transports);
} else {
  console.log("Could not find transport-reg input");
}

