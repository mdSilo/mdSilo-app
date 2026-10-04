import { useEffect, useState } from 'react';
import { get, set } from 'file/storage';

/** storage key, read by the web feed fetcher: src/platform/web/feed.ts */
export const CORS_PROXY_KEY = 'cors_proxy';

/**
 * CORS proxy to fetch RSS feeds on web, browser blocks most feeds w/o it.
 */
export function CorsProxySetting() {
  const [proxy, setProxy] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let active = true;
    get(CORS_PROXY_KEY)
      .then((value) => {
        if (active && typeof value === 'string') {
          setProxy(value);
          setSaved(value);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const save = async () => {
    const value = proxy.trim();
    if (value === saved) return;
    await set(CORS_PROXY_KEY, value);
    setSaved(value);
  };

  return (
    <div className="flex flex-col items-center mb-2">
      <div className="mb-2 text-center">
        <h1 className="text-base font-semibold">RSS CORS Proxy</h1>
        <p className="mt-1 text-sm text-gray-700">
          Used when a feed can not be fetched directly. <code>{'{url}'}</code> is replaced
          by the feed url, or the url is appended. <code>none</code> to disable.
          Empty for default: the proxy of this site if any, otherwise a public proxy
          (api.allorigins.win) which can see the feed urls.
        </p>
      </div>
      <input
        type="text"
        aria-label="RSS CORS Proxy"
        className="w-full p-1 rounded border-none outline-none text-sm"
        style={{ maxWidth: '24em' }}
        placeholder="https://proxy.example.com/?url={url}"
        value={proxy}
        onChange={(e) => setProxy(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
      />
    </div>
  );
}
