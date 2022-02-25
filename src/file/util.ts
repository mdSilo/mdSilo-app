
export const isTauri = Boolean(
	typeof window !== 'undefined' 
  && window !== undefined 
  && (window as any).__TAURI__ !== undefined 
  && (window as any).promisified !== null
);

/**
 * Normalize slashes of a file path
 * @param {string} path
 * @returns {string}
 */
export const normalizeSlash = (path: string): string => {
  if (path === '\\' || path === '/') {
    return '/';
  }

  path = path.replace(/\\/g, '/');

  if (path.length === 2 && /.:/.test(path)) {
    return path + '/';
  }

  if (path.endsWith('/') && !(path.length === 3 && /.:\//.test(path))) { 
    return path.slice(0, path.length - 1);
  }
  
  return path;
};

/**
 * Join multiple path parts into a string.
 * @param {string[]} ...args paths
 * @returns {string}
 */
export const joinPath = (...args: string[]): string => {
  if (args.length === 0) {
    return '.';
  }

  let joined: string = '';

  for (const arg of args) {
    if (arg.length > 0) {
      if (!joined) {
        joined = trimSlash(arg, 'end');
      } else {
        if (!(joined.endsWith('/') || joined.endsWith('\\'))) {
          joined += '/';
          joined += trimSlashAll(arg);
        } 
      }
    }
  }

  return joined || '.';
};

/**
 * Get dirname of the path( / end)
 * @param {string} path path to be evaluated
 * @returns {any} result of the evaluated path
 */
export const getDirname = (path: string): string => {
	if (path.length === 0) {
    return '.';
  }

	let code = path.charCodeAt(0);
	const hasRoot = code === 47 || code === 92; // 47 - / slash, 92- \ backslash
	let end = -1;
	let matchedSlash = true;
	for (let i = path.length - 1; i >= 1; --i) {
		code = path.charCodeAt(i);
		if (code === 47 || code === 92) {
			if (!matchedSlash) {
				end = i;
				break;
			}
		} else {
			// We saw the first non-path separator
			matchedSlash = false;
		}
	}
	if (end === -1) return hasRoot ? '/' : '.';
	if (hasRoot && end === 1) return '//';
	const result = path.slice(0, end);
	if (!(result.endsWith('/') || result.endsWith('\\'))) {
    return result + '/';
  } else {
    return result;
  }
};


function trimSlash(txt: string, mode = 'start') {
  if (mode === 'start') {
    while (txt.startsWith('/')) {
      txt = txt.substring(0);
    }
    return txt;
  } else {
    while (txt.endsWith('/')) {
      txt = txt.substring(0, txt.length - 1);
    }
    return txt;
  }
}

function trimSlashAll(txt: string) {
  const txt0 = trimSlash(txt);
  const txt1 = trimSlash(txt0, 'end');
  return txt1;
}
