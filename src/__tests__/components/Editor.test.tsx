import { render, screen, act } from '@testing-library/react';
import Editor from 'components/editor/Editor';
import { store } from 'lib/store';
import notes from '__fixtures__/notes';

describe('Editor', () => {
  const renderEditor = () => {
    const firstNote = Object.values(store.getState().notes)[0].content;
    return render(
      <Editor value={firstNote} setValue={jest.fn()} onChange={jest.fn()} />
    );
  };

  beforeEach(() => {
    act(() => {
      store.getState().setNotes(notes);
    });
  });

  it('renders editor and placeholder', () => {
    renderEditor();

    const editor = screen.getByRole('textbox');
    expect(editor).toBeInTheDocument();

    const placeholder = screen.getByText('Start writing here…');
    expect(placeholder).toBeInTheDocument();
  });
});
