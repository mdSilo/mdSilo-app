import { describe, expect, test, vi } from 'vitest';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from 'lib/store';
import { renderWithView } from '../../testUtils';
import Kanban from './kanban';

const files = vi.hoisted(() => ({
  content: '' as string,
  written: [] as { path: string; text: string }[],
}));

// the real FileAPI only reads files inside Tauri
vi.mock('file/files', () => ({
  default: class {
    fileName: string;
    constructor(name: string, parent?: string) {
      this.fileName = parent ? `${parent}/${name}` : name;
    }
    async readFile() {
      return files.content;
    }
    async writeFile(text: string) {
      files.written.push({ path: this.fileName, text });
    }
  },
}));

const boards = {
  default: { columns: [{ id: 'c1', title: 'Todo' }], cards: [{ id: 1, columnId: 'c1', content: 'card A' }] },
  work: { columns: [{ id: 'w1', title: 'Sprint' }], cards: [], bgColor: '#000000' },
};

describe('Kanban view', () => {
  test('loads boards from kanban.json and switches between them', async () => {
    files.content = JSON.stringify(boards);
    store.getState().setInitDir('/root');
    renderWithView(<Kanban />);
    expect(await screen.findByText('card A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'default' })).toHaveClass('text-green-500');
    await userEvent.click(screen.getByRole('button', { name: 'work' }));
    expect(store.getState().currentBoard).toBe('work');
    expect(await screen.findByText('Sprint')).toBeInTheDocument();
  });

  test('saves board changes, keeping other boards', async () => {
    files.content = JSON.stringify(boards);
    files.written = [];
    store.getState().setInitDir('/root');
    renderWithView(<Kanban />);
    await screen.findByText('card A');
    await userEvent.click(screen.getByText('+ Add Column'));
    await waitFor(() => expect(files.written).toHaveLength(1));
    expect(files.written[0].path).toBe('/root/kanban.json');
    const saved = JSON.parse(files.written[0].text);
    expect(saved.default.columns).toHaveLength(2);
    expect(saved.default.cards).toEqual(boards.default.cards);
    expect(saved.work).toEqual(boards.work);
  });

  test('shows a stored board without cards on first load', async () => {
    files.content = JSON.stringify(boards);
    store.getState().setInitDir('/root');
    store.getState().setCurrentBoard('work');
    renderWithView(<Kanban />);
    expect(await screen.findByText('Sprint')).toBeInTheDocument();
  });

  test('creates a new board by name', async () => {
    files.content = '';
    store.getState().setInitDir('/root');
    renderWithView(<Kanban />);
    const input = screen.getByPlaceholderText('Type to new board');
    fireEvent.change(input, { target: { value: 'ideas' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(store.getState().currentBoard).toBe('ideas');
    expect(screen.getByText('+ Add Column')).toBeInTheDocument();
  });
});
