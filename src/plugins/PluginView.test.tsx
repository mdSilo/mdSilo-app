import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import SideMenu from '@/shell/SideMenu';
import { renderWithView } from '@/testUtils';
import { parseManifest } from './manifest';
import { enablePlugin, pluginViews, type InstalledPlugin } from './registry';
import PluginView from './PluginView';

const stats: InstalledPlugin = {
  id: 'stats',
  dir: '/data/stats',
  manifest: parseManifest({
    id: 'stats', name: 'Stats', version: '1.0.0',
    contributes: { views: [{ id: 'reading', title: 'Reading Stats', page: 'reading.html' }, { id: 'notes', title: 'Note Stats' }] },
  }),
};

const Probe = () => {
  const { state } = useCurrentViewContext();
  return state.view === 'plugin' ? <PluginView /> : <p>{state.view}</p>;
};

beforeEach(() => {
  store.setState({ installedPlugins: [stats], pluginStates: {} });
  store.getState().setCurrentDir('/n');
});

describe('the views of plugins', () => {
  it('lists the views of the enabled plugins', () => {
    expect(pluginViews()).toEqual([]);
    enablePlugin(stats);
    expect(pluginViews().map(({ view }) => view.id)).toEqual(['reading', 'notes']);
  });

  it('has no menu without a view', () => {
    renderWithView(<div id="app-container"><SideMenu /></div>);
    expect(screen.queryByRole('button', { name: 'Plugins' })).toBeNull();
  });

  it('opens a view from the side menu, on its own page', async () => {
    enablePlugin(stats);
    renderWithView(<div id="app-container"><SideMenu /><Probe /></div>);
    await userEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    await userEvent.click(screen.getByText('Reading Stats'));
    const frame = screen.getByTitle('Stats');
    expect(frame.getAttribute('src')).toContain('stats/reading.html');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('opens the main page for a view without one', async () => {
    enablePlugin(stats);
    renderWithView(<div id="app-container"><SideMenu /><Probe /></div>);
    await userEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    await userEvent.click(screen.getByText('Note Stats'));
    expect(screen.getByTitle('Stats').getAttribute('src')).toContain('stats/index.html');
  });

  it('says when the view is gone', async () => {
    enablePlugin(stats);
    renderWithView(<div id="app-container"><SideMenu /><Probe /></div>);
    await userEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    await userEvent.click(screen.getByText('Note Stats'));
    store.setState({ installedPlugins: [] });
    expect(await screen.findByText('The view notes of stats is not installed.')).toBeInTheDocument();
  });
});
