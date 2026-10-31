import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { useTTS } from '@/reader/tts/tts';
import { useEngines } from '@/speech/speech';
import SideMenu from '@/shell/SideMenu';
import { mockInvoke, renderWithView } from '../testUtils';
import { onPauseRequest, playing, usePlayer } from './playerStore';
import Player from './Player';

const ViewProbe = () => {
  const { state } = useCurrentViewContext();
  return <p data-testid="view">{JSON.stringify(state)}</p>;
};

beforeEach(() => {
  usePlayer.setState({ shown: false });
  useTTS.setState({ status: 'idle', active: false, error: undefined });
  useEngines.setState({ engines: [], loaded: true });
});

test('one at a time: a source playing pauses the others, shows the player', () => {
  const pausePodcast = vi.fn();
  const pauseTTS = vi.fn();
  const offPodcast = onPauseRequest('podcast', pausePodcast);
  const offTTS = onPauseRequest('tts', pauseTTS);
  playing('tts');
  expect(pausePodcast).toHaveBeenCalledTimes(1);
  expect(pauseTTS).not.toHaveBeenCalled();
  expect(usePlayer.getState().shown).toBe(true);
  playing('podcast');
  expect(pauseTTS).toHaveBeenCalledTimes(1);
  offPodcast();
  offTTS();
});

describe('Player', () => {
  test('hidden, it keeps the podcast; shown, its title to the article', async () => {
    const article = { id: 1, title: 'Ep 1', url: 'https://pod/1' };
    mockInvoke(invoke, { get_article_by_url: article, get_articles: [] });
    store.getState().setCurrentPod({ title: 'Ep 1', url: 'ep1.mp3', article_url: 'https://pod/1', feed_link: 'f' });
    renderWithView(<><Player /><ViewProbe /></>);
    expect(screen.getByTestId('player')).toHaveClass('hidden');
    expect(document.querySelector('audio')).toHaveAttribute('src', 'ep1.mp3');
    // played: shown
    fireEvent.play(document.querySelector('audio')!);
    expect(screen.getByTestId('player')).not.toHaveClass('hidden');
    await userEvent.click(screen.getByText('Ep 1'));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('view').textContent!).view).toBe('feed'));
    expect(store.getState().currentArticle).toEqual(article);
  });

  test('another pod: the audio of it', () => {
    mockInvoke(invoke, { get_articles: [] });
    store.getState().setCurrentPod({ title: 'Ep 1', url: 'ep1.mp3', article_url: 'a', feed_link: 'f' });
    renderWithView(<Player />);
    store.getState().setCurrentPod({ title: 'Ep 2', url: 'ep2.mp3', article_url: 'b', feed_link: 'f' });
    return waitFor(() => expect(document.querySelector('audio')).toHaveAttribute('src', 'ep2.mp3'));
  });

  test('a book read aloud: its controls, kept once stopped; the error of the engine; closed', async () => {
    useEngines.setState({
      engines: [
        { id: 'system', name: 'System', kind: 'live', online: false, fields: [], available: true, config: {} },
        { id: 'web', name: 'Browser', kind: 'web', online: false, fields: [], available: true, config: {} },
      ],
    });
    mockInvoke(invoke, { tts_voices: [] });
    useTTS.getState().setStatus('paused');
    useTTS.setState({ active: true });
    usePlayer.setState({ shown: true });
    renderWithView(<Player />);
    expect(screen.getByTitle('Play')).toBeInTheDocument();
    expect(screen.getByTitle('Stop')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Engine'), 'web');
    expect(store.getState().readerSettings?.ttsEngine).toBe('web');
    // stopped: the controls still there, to play again
    useTTS.getState().setStatus('idle');
    expect(await screen.findByTitle('Play')).toBeInTheDocument();
    expect(screen.queryByTitle('Stop')).not.toBeInTheDocument();
    useTTS.setState({ error: 'No voice' });
    expect(await screen.findByRole('alert')).toHaveTextContent('No voice');
    await userEvent.click(screen.getByTitle('Close'));
    expect(screen.queryByTestId('tts-bar')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing playing/)).toBeInTheDocument();
  });

  test('the voices of the engine, of the language of the book', async () => {
    useEngines.setState({
      engines: [{ id: 'system', name: 'System', kind: 'live', online: false, fields: [], available: true, config: {} }],
    });
    mockInvoke(invoke, {
      tts_voices: [{ id: 'a', name: 'Alice', lang: 'en-US' }, { id: 'b', name: 'Bob', lang: 'en-GB' }],
    });
    useTTS.getState().setStatus('playing');
    usePlayer.setState({ shown: true });
    renderWithView(<Player />);
    await userEvent.selectOptions(await screen.findByLabelText('Voice'), 'b');
    expect(store.getState().readerSettings?.ttsVoices).toEqual({ system: 'b' });
  });
});

test('the speech engines: opened from the player, kept open once it is hidden', async () => {
  usePlayer.setState({ shown: true, settingsOpen: false });
  renderWithView(<Player />);
  await userEvent.click(screen.getByTitle('Speech engines'));
  expect(await screen.findByText('Speech engines', { selector: 'h3, h2, [id*=headlessui-dialog-title]' })).toBeInTheDocument();
  // not inside the player
  expect(screen.getByTestId('player')).not.toContainElement(screen.getByRole('dialog'));
  await userEvent.click(screen.getByTitle('Hide'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('SideMenu: the player shown and hidden', async () => {
  renderWithView(<div id="app-container"><SideMenu /><Player /></div>);
  expect(screen.getByTestId('player')).toHaveClass('hidden');
  await userEvent.click(screen.getByRole('button', { name: 'Player' }));
  expect(screen.getByTestId('player')).not.toHaveClass('hidden');
  await userEvent.click(screen.getByRole('button', { name: 'Player' }));
  expect(screen.getByTestId('player')).toHaveClass('hidden');
});
