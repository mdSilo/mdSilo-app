import { store } from '@/state/store';
import { createHost, type PluginMethods } from './host';
import { parseManifest } from './manifest';
import { enablePlugin, type InstalledPlugin } from './registry';

const plugin: InstalledPlugin = {
  id: 'csv',
  dir: '/data/csv',
  manifest: parseManifest({ id: 'csv', name: 'CSV', version: '1.2.0', permissions: ['file:read', 'file:write'] }),
};

let frame: HTMLIFrameElement;
let other: HTMLIFrameElement;
let posted: ReturnType<typeof vi.fn>;

/** what the page of the plugin, or another page, sends */
const send = (data: unknown, source: Window | null = frame.contentWindow) =>
  window.dispatchEvent(new MessageEvent('message', { data, source }));

/** the answer to the last call */
const answer = async () => {
  await vi.waitFor(() => expect(posted).toHaveBeenCalled());
  return posted.mock.calls.at(-1)?.[0];
};

const methods: PluginMethods = {
  'file.read': { permission: 'file:read', handler: () => 'a,b' },
  'file.write': { permission: 'file:write', handler: () => { throw new Error('Disk full'); } },
  'echo': { handler: (params) => params },
};

beforeEach(() => {
  store.setState({ pluginStates: {} });
  enablePlugin(plugin, ['file:read']);
  frame = document.createElement('iframe');
  other = document.createElement('iframe');
  document.body.append(frame, other);
  posted = vi.fn();
  frame.contentWindow!.postMessage = posted as Window['postMessage'];
});

afterEach(() => {
  frame.remove();
  other.remove();
});

describe('createHost', () => {
  it('answers a call with what the method gives', async () => {
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 7, method: 'echo', params: { x: 1 } });
    expect(await answer()).toEqual({ mdsilo: 1, id: 7, result: { x: 1 } });
    expect(posted.mock.calls[0][1]).toBe('*');
    host.dispose();
  });

  it('checks the permission granted', async () => {
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 1, method: 'file.read' });
    expect(await answer()).toEqual({ mdsilo: 1, id: 1, result: 'a,b' });
    posted.mockClear();
    send({ mdsilo: 1, id: 2, method: 'file.write' });
    expect(await answer()).toEqual({ mdsilo: 1, id: 2, error: 'Not permitted: file:write' });
    host.dispose();
  });

  it('reads the permissions on each call', async () => {
    const host = createHost(plugin, frame, () => methods);
    enablePlugin(plugin, []);
    send({ mdsilo: 1, id: 1, method: 'file.read' });
    expect(await answer()).toEqual({ mdsilo: 1, id: 1, error: 'Not permitted: file:read' });
    host.dispose();
  });

  it('gives the errors of the methods, and of unknown methods', async () => {
    enablePlugin(plugin);
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 1, method: 'file.write' });
    expect(await answer()).toEqual({ mdsilo: 1, id: 1, error: 'Disk full' });
    posted.mockClear();
    send({ mdsilo: 1, id: 2, method: 'toString' });
    expect(await answer()).toEqual({ mdsilo: 1, id: 2, error: 'Unknown method: toString' });
    host.dispose();
  });

  it('has app.info for every plugin', async () => {
    const host = createHost(plugin, frame);
    send({ mdsilo: 1, id: 1, method: 'app.info' });
    expect((await answer()).result).toEqual({ id: 'csv', version: '1.2.0', permissions: ['file:read'] });
    host.dispose();
  });

  it('a plugin can not replace app.info', async () => {
    const host = createHost(plugin, frame, () => ({ 'app.info': { handler: () => 'fake' } }));
    send({ mdsilo: 1, id: 1, method: 'app.info' });
    expect((await answer()).result).not.toBe('fake');
    host.dispose();
  });

  it('ignores other pages and other messages', async () => {
    const host = createHost(plugin, frame, () => methods);
    send({ mdsilo: 1, id: 1, method: 'echo' }, other.contentWindow);
    send({ mdsilo: 1, id: 1, method: 'echo' }, window);
    send({ mdsilo: 2, id: 1, method: 'echo' });
    send({ id: 1, method: 'echo' });
    send('echo');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).not.toHaveBeenCalled();
    host.dispose();
  });

  it('stops answering when disposed, and tells of changes', async () => {
    const host = createHost(plugin, frame, () => methods);
    host.emit('style', { dark: true });
    expect(posted).toHaveBeenCalledWith({ mdsilo: 1, event: 'style', data: { dark: true } }, '*');
    posted.mockClear();
    host.dispose();
    send({ mdsilo: 1, id: 1, method: 'echo' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).not.toHaveBeenCalled();
  });
});
