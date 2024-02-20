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
    if (!window.__TAURI_POST_MESSAGE__) {
      reject('__TAURI_POST_MESSAGE__ does not exist!');
    }

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

// functions availabe:
// invoke(): to call commands on rust backend
// events available: 
// PageLoaded event with note id

window.uid = uid;
window.invoke = invoke;
window.message = message;
window.transformCallback = transformCallback;

