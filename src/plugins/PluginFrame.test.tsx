import { render, screen } from '@testing-library/react';
import { store } from '@/state/store';
import { parseManifest } from './manifest';
import { enablePlugin, type InstalledPlugin } from './registry';
import PluginFrame from './PluginFrame';

const plugin: InstalledPlugin = {
  id: 'csv',
  dir: '/data/csv',
  manifest: parseManifest({ id: 'csv', name: 'CSV', version: '1.0.0', main: 'dist/view.html' }),
};

beforeEach(() => store.setState({ pluginStates: {} }));

describe('PluginFrame', () => {
  it('shows nothing of a plugin not enabled', () => {
    render(<PluginFrame plugin={plugin} />);
    expect(screen.getByText('CSV is not enabled.')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('puts the page of the plugin in a sandbox, scripts only', () => {
    enablePlugin(plugin);
    const onHost = vi.fn();
    const { unmount } = render(<PluginFrame plugin={plugin} onHost={onHost} />);
    const frame = screen.getByTitle('CSV');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('src')).toContain('csv/dist/view.html');
    expect(onHost).toHaveBeenLastCalledWith(expect.objectContaining({ emit: expect.any(Function) }));
    unmount();
    expect(onHost).toHaveBeenLastCalledWith(null);
  });
});
