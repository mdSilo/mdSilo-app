import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import { store } from 'lib/store';
import { useCurrentViewContext } from 'context/useCurrentView';
import { makeFileMeta, mockInvoke, renderWithView } from '../../testUtils';
import KanbanBoard from './Board';
import ColumnContainer from './Column';
import TaskCard from './Card';
import type { KanbanData } from './types';

const ViewProbe = () => {
  const { state } = useCurrentViewContext();
  return <p data-testid="view">{JSON.stringify(state)}</p>;
};

const data = (): KanbanData => ({
  columns: [
    { id: 'c1', title: 'Todo' },
    { id: 'c2', title: 'Done', bgColor: 'red' },
  ],
  cards: [
    {
      id: 1,
      columnId: 'c1',
      content: 'first card',
      items: [
        { name: 'note.md', uri: '/n/note.md', category: 'note' },
        { name: 'doc.pdf', uri: '/n/doc.pdf', category: 'attach' },
      ],
    },
    { id: 2, columnId: 'c2', content: 'second card' },
  ],
  bgColor: '#ffffff',
});

const renderBoard = (onKanbanChange = vi.fn()) => {
  renderWithView(
    <>
      <KanbanBoard initData={data()} onKanbanChange={onKanbanChange} />
      <ViewProbe />
    </>
  );
  return onKanbanChange;
};

const lastChange = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1) as unknown[];

describe('TaskCard', () => {
  const renderCard = (props: Partial<Parameters<typeof TaskCard>[0]> = {}) =>
    render(
      <DndContext sensors={[]}>
        <TaskCard card={{ id: 7, columnId: 'c', content: 'hello', bgColor: 'blue' }} updateCard={vi.fn()} {...props} />
      </DndContext>
    );

  test('edits content and leaves edit mode with Shift+Enter', async () => {
    const updateCard = vi.fn();
    renderCard({ updateCard });
    await userEvent.click(screen.getByText('hello'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'changed' } });
    expect(updateCard).toHaveBeenCalledWith(7, 'changed');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('hover actions link a note and open the card modal', async () => {
    const openSetCard = vi.fn();
    renderCard({ openSetCard });
    fireEvent.mouseEnter(screen.getByText('hello').parentElement as HTMLElement);
    fireEvent.click(screen.getByTitle('Link Note'));
    expect(store.getState().isFindOrCreateModalOpen).toBe(true);
    expect(store.getState().currentCard).toBe(7);

    renderCard({ openSetCard });
    fireEvent.mouseEnter(screen.getAllByText('hello')[1].parentElement as HTMLElement);
    fireEvent.click(screen.getByTitle('Card Modal'));
    expect(openSetCard).toHaveBeenCalledWith(7);
  });

  test('attach copies the file into assets', async () => {
    store.getState().setInitDir('/root');
    vi.mocked(dialog.open).mockResolvedValueOnce('/tmp/doc.pdf' as never);
    mockInvoke(invoke, {
      copy_file_to_assets: ['/root/assets/doc.pdf', './assets/doc.pdf'],
      file_exist: false,
    });
    const { container } = renderCard();
    fireEvent.mouseEnter(screen.getByText('hello').parentElement as HTMLElement);
    fireEvent.click(container.querySelector('button.hidden') as HTMLElement);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('copy_file_to_assets', { srcPath: '/tmp/doc.pdf', workDir: '/root' })
    );
    expect(invoke).toHaveBeenCalledWith('file_exist', { filePath: '/root/assets/doc.pdf' });
  });
});

describe('ColumnContainer', () => {
  const renderColumn = (props: Partial<Parameters<typeof ColumnContainer>[0]> = {}) => {
    const handlers = {
      toDelColumn: vi.fn(),
      updateColumn: vi.fn(),
      createCard: vi.fn(),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      openSetCol: vi.fn(),
      openSetCard: vi.fn(),
    };
    render(
      <DndContext sensors={[]}>
        <ColumnContainer
          column={{ id: 'c1', title: 'Todo', hdColor: 'black', ftColor: 'yellow' }}
          cards={[{ id: 1, columnId: 'c1', content: 'card a' }]}
          {...handlers}
          {...props}
        />
      </DndContext>
    );
    return handlers;
  };

  test('renders title and cards', () => {
    renderColumn();
    expect(screen.getByText('Todo')).toHaveStyle({ color: 'rgb(255, 255, 0)' });
    expect(screen.getByText('card a')).toBeInTheDocument();
  });

  test('edits the title', async () => {
    const { updateColumn } = renderColumn();
    await userEvent.click(screen.getByText('Todo'));
    const input = screen.getByDisplayValue('Todo');
    fireEvent.change(input, { target: { value: 'Doing' } });
    expect(updateColumn).toHaveBeenCalledWith('c1', 'Doing');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByDisplayValue('Todo')).not.toBeInTheDocument();
  });

  test('adds a card on Enter', async () => {
    const { createCard } = renderColumn();
    await userEvent.click(screen.getByText('Add Card'));
    const textarea = screen.getByPlaceholderText('Type then Press Enter');
    fireEvent.change(textarea, { target: { value: 'new one' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(createCard).toHaveBeenCalledWith('c1', 'new one');
    expect(screen.queryByPlaceholderText('Type then Press Enter')).not.toBeInTheDocument();
  });

  test('hover shows delete and settings', () => {
    const { toDelColumn, openSetCol } = renderColumn();
    const header = screen.getByText('Todo').closest('.cursor-grab') as HTMLElement;
    fireEvent.mouseEnter(header);
    fireEvent.click(screen.getByTitle('Column Setting'));
    expect(openSetCol).toHaveBeenCalledWith('c1');
    fireEvent.click(within(header).getAllByRole('button')[0]);
    expect(toDelColumn).toHaveBeenCalledWith('c1');
    fireEvent.mouseLeave(header);
    expect(screen.queryByTitle('Column Setting')).not.toBeInTheDocument();
  });
});

describe('KanbanBoard', () => {
  test('renders columns and their cards', () => {
    renderBoard();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('first card')).toBeInTheDocument();
    expect(screen.getByText('second card')).toBeInTheDocument();
  });

  test('adds a column', async () => {
    const onChange = renderBoard();
    await userEvent.click(screen.getByText('+ Add Column'));
    expect(screen.getByText('Column 3')).toBeInTheDocument();
    expect((lastChange(onChange)[0] as unknown[]).length).toBe(3);
  });

  test('adds, edits cards and renames columns', async () => {
    const onChange = renderBoard();
    await userEvent.click(screen.getAllByText('Add Card')[0]);
    const textarea = screen.getByPlaceholderText('Type then Press Enter');
    fireEvent.change(textarea, { target: { value: 'third card' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(screen.getByText('third card')).toBeInTheDocument();
    expect((lastChange(onChange)[1] as { content: string }[]).map((c) => c.content)).toContain('third card');

    await userEvent.click(screen.getByText('second card'));
    fireEvent.change(screen.getByDisplayValue('second card'), { target: { value: 'edited' } });
    expect((lastChange(onChange)[1] as { content: string }[]).map((c) => c.content)).toContain('edited');

    await userEvent.click(screen.getByText('Todo'));
    fireEvent.change(screen.getByDisplayValue('Todo'), { target: { value: 'Backlog' } });
    expect((lastChange(onChange)[0] as { title: string }[])[0].title).toBe('Backlog');
  });

  test('deletes a column and its cards after confirmation', async () => {
    const onChange = renderBoard();
    const header = screen.getByText('Todo').closest('.cursor-grab') as HTMLElement;
    fireEvent.mouseEnter(header);
    fireEvent.click(within(header).getAllByRole('button')[0]);
    await userEvent.click(await screen.findByText('Confirm Delete'));
    expect(screen.queryByText('first card')).not.toBeInTheDocument();
    const [columns, cards] = lastChange(onChange) as [{ id: string }[], { id: number }[]];
    expect(columns.map((c) => c.id)).toEqual(['c2']);
    expect(cards.map((c) => c.id)).toEqual([2]);
  });

  test('sets a column color', async () => {
    const onChange = renderBoard();
    const header = screen.getByText('Done').closest('.cursor-grab') as HTMLElement;
    fireEvent.mouseEnter(header);
    fireEvent.click(within(header).getByTitle('Column Setting'));
    const picker = (await screen.findByText('Set Color')).nextElementSibling as HTMLElement;
    fireEvent.change(within(picker).getByRole('combobox'), { target: { value: 'head' } });
    fireEvent.click(within(picker).getAllByRole('button')[0]);
    const columns = lastChange(onChange)[0] as { id: string; hdColor?: string }[];
    expect(columns.find((c) => c.id === 'c2')?.hdColor).toBe('rgb(220 38 38)');
  });

  test('card modal opens items, removes them and sets colors', async () => {
    mockInvoke(invoke, {
      file_exist: true,
      get_file_meta: makeFileMeta({ file_path: '/n/note.md', file_name: 'note.md' }),
      get_parent_dir: '/n',
    });
    renderBoard();
    fireEvent.mouseEnter(screen.getByText('first card').parentElement as HTMLElement);
    fireEvent.click(screen.getByTitle('Card Modal'));
    // the click also toggles the card into edit mode; leave it
    fireEvent.blur(screen.getByDisplayValue('first card'));

    await userEvent.click(await screen.findByText('doc.pdf'));
    expect(invoke).toHaveBeenCalledWith('open_url', { url: '/n/doc.pdf' });

    await userEvent.click(screen.getByText('note.md'));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('view').textContent as string).params?.noteId).toBe('/n/note.md')
    );
  });

  test('card modal removes items and sets colors', async () => {
    const onChange = renderBoard();
    fireEvent.mouseEnter(screen.getByText('first card').parentElement as HTMLElement);
    fireEvent.click(screen.getByTitle('Card Modal'));
    fireEvent.blur(screen.getByDisplayValue('first card'));

    const item = await screen.findByText('doc.pdf');
    fireEvent.click(item.nextSibling as HTMLElement);
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument();
    const cards = lastChange(onChange)[1] as { id: number; items?: { uri: string }[] }[];
    expect(cards[0].items?.map((i) => i.uri)).toEqual(['/n/note.md']);

    const picker = screen.getAllByText('Set Color').at(-1)?.nextElementSibling as HTMLElement;
    fireEvent.change(within(picker).getByRole('combobox'), { target: { value: 'font' } });
    fireEvent.click(within(picker).getAllByRole('button')[1]);
    const updated = lastChange(onChange)[1] as { id: number; ftColor?: string }[];
    expect(updated[0].ftColor).toBe('rgb(245 158 11)');
  });

  test('sets board background color and image', async () => {
    const onChange = renderBoard();
    fireEvent.change(screen.getByTitle('Board Background Color'), { target: { value: '#123456' } });
    expect(lastChange(onChange).slice(2)).toEqual(['#123456', undefined]);

    vi.mocked(dialog.open).mockResolvedValueOnce('/pics/bg.png' as never);
    await userEvent.click(screen.getByText('+ Board Image'));
    await waitFor(() => expect(lastChange(onChange)[3]).toBe('asset://localhost/%2Fpics%2Fbg.png'));
  });
});
