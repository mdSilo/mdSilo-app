// *** Core Script - IPC ***
// copy from: https://github.com/lencx/ChatGPT/blob/main/src-tauri/src/scripts/core.js
// under GNU Affero General Public License v3.0

const uid = () => window.crypto.getRandomValues(new Uint32Array(1))[0];
function transformCallback(callback = () => {}, once = false) {
  const identifier = uid();
  const prop = `_${identifier}`;
  Object.defineProperty(window, prop, {
    value: (result) => {
      if (once) {
        Reflect.deleteProperty(window, prop);
      }
      return callback(result)
    },
    writable: false,
    configurable: true,
  })
  return identifier;
}

async function invoke(cmd, args) {
  return new Promise((resolve, reject) => {
    if (!window.__TAURI_POST_MESSAGE__) reject('__TAURI_POST_MESSAGE__ does not exist!');
    const callback = transformCallback((e) => {
      resolve(e);
      Reflect.deleteProperty(window, `_${error}`);
    }, true)
    const error = transformCallback((e) => {
      reject(e);
      Reflect.deleteProperty(window, `_${callback}`);
    }, true)
    window.__TAURI_POST_MESSAGE__({
      cmd,
      callback,
      error,
      ...args
    });
  });
}

async function message(message) {
  invoke('messageDialog', {
    __tauriModule: 'Dialog',
    message: {
      cmd: 'messageDialog',
      message: message.toString(),
      title: null,
      type: null,
      buttonLabel: null
    }
  });
}

window.uid = uid;
window.invoke = invoke;
window.message = message;
window.transformCallback = transformCallback;

async function init() {
  document.addEventListener("click", (e) => {
    const origin = e.target.closest("a");
    if (!origin || !origin.target) return;
    if (origin && origin.href && origin.target !== '_self') {
      invoke('open_link', { url: origin.href });
    }
  });

  // Fix Chinese input method "Enter" on Safari
  document.addEventListener("keydown", (e) => {
    if(e.keyCode == 229) e.stopPropagation();
  }, true)

  console.log("inject init js");
}

if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  init();
} else {
  document.addEventListener("DOMContentLoaded", init);
}
