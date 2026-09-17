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
  const tauriInvoke = window.__TAURI__?.core?.invoke;
  if (typeof tauriInvoke !== 'function') {
    throw new Error('Tauri invoke is unavailable');
  }
  return tauriInvoke(cmd, args);
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

// functions availabe:
// invoke(): to call commands on rust backend
// events available: 
// PageLoaded event with note id

window.uid = uid;
window.invoke = invoke;
window.message = message;
window.transformCallback = transformCallback;

