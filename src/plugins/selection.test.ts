import { store } from '@/state/store';
import { askPlugin } from './background';
import { parseManifest } from './manifest';
import { enablePlugin, type InstalledPlugin } from './registry';
import { runSelectionAction, selectionActionsIn, textOf } from './selection';

vi.mock('./background', () => ({ askPlugin: vi.fn() }));

const plugin: InstalledPlugin = {
  id: 'ai',
  dir: '/data/ai',
  manifest: parseManifest({
    id: 'ai', name: 'AI', version: '1.0.0',
    contributes: {
      selectionActions: [{ id: 'explain', title: 'Explain' }, { id: 'cite', title: 'Cite', where: ['editor'] }],
    },
  }),
};

beforeEach(() => {
  store.setState({ installedPlugins: [plugin], pluginStates: {} });
  vi.mocked(askPlugin).mockReset();
});

describe('selectionActionsIn', () => {
  it('lists the actions of the enabled plugins in a place', () => {
    expect(selectionActionsIn('reader')).toEqual([]);
    enablePlugin(plugin);
    expect(selectionActionsIn('reader').map(({ action }) => action.id)).toEqual(['explain']);
    expect(selectionActionsIn('editor').map(({ action }) => action.id)).toEqual(['explain', 'cite']);
  });
});

describe('runSelectionAction', () => {
  const explain = () => selectionActionsIn('reader')[0];
  beforeEach(() => enablePlugin(plugin));

  it('asks the plugin with the text and where it is', async () => {
    vi.mocked(askPlugin).mockResolvedValue('A word.');
    expect(await runSelectionAction(explain(), 'word', 'reader', 'en')).toEqual({ text: 'A word.' });
    expect(askPlugin).toHaveBeenCalledWith(plugin, 'selection.action', { action: 'explain', text: 'word', where: 'reader', lang: 'en' });
  });

  it('sanitizes the html it answers', async () => {
    vi.mocked(askPlugin).mockResolvedValue({ html: '<p style="position:fixed" onclick="x()">A <b>word</b></p><script>1</script>' });
    const result = await runSelectionAction(explain(), 'word', 'reader');
    expect(result).toEqual({ html: '<p>A <b>word</b></p>' });
    expect(textOf(result)).toBe('A word');
  });

  it('takes { text } too, and nothing else', async () => {
    vi.mocked(askPlugin).mockResolvedValue({ text: 'plain' });
    expect(await runSelectionAction(explain(), 'w', 'reader')).toEqual({ text: 'plain' });
    vi.mocked(askPlugin).mockResolvedValue(42);
    await expect(runSelectionAction(explain(), 'w', 'reader')).rejects.toThrow('AI gave no text');
  });
});
