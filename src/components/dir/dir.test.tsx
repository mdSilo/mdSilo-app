import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { mockInvoke } from '../../testUtils';
import DirDelModal from './DirDelModal';
import DirNewModal from './DirNewModal';
import DirRenameModal from './DirRenameModal';

const joinPaths = ({ root, parts }: Record<string, unknown>) => [root, ...(parts as string[])].join('/');

describe('DirDelModal', () => {
  test('deletes the folder on confirm', async () => {
    const handleClose = vi.fn();
    render(<DirDelModal dirPath="/n/sub" isOpen handleClose={handleClose} />);
    expect(await screen.findByText('/n/sub')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Confirm Delete Folder and All Items'));
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('delete_files', { paths: ['/n/sub'] });
  });

  test('cancel just closes', async () => {
    const handleClose = vi.fn();
    render(<DirDelModal dirPath="/n/sub" isOpen handleClose={handleClose} />);
    await userEvent.click(await screen.findByText('Cancel Delete'));
    expect(handleClose).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('DirNewModal', () => {
  test('creates a subfolder with the typed name', async () => {
    mockInvoke(invoke, { join_paths: joinPaths });
    const handleClose = vi.fn();
    render(<DirNewModal dirPath="/n" isOpen handleClose={handleClose} />);
    await userEvent.type(await screen.findByPlaceholderText('New subfolder name'), 'child');
    await userEvent.click(screen.getByText('Create Subfolder'));
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('create_dir_recursive', { dirPath: '/n/child' });
  });
});

describe('DirRenameModal', () => {
  test('renames the folder within its parent', async () => {
    mockInvoke(invoke, { join_paths: joinPaths, get_parent_dir: '/n' });
    const handleClose = vi.fn();
    render(<DirRenameModal dirPath="/n/old" isOpen handleClose={handleClose} />);
    await userEvent.type(await screen.findByPlaceholderText('Rename folder'), 'new');
    await userEvent.click(screen.getByText('Rename Folder'));
    await waitFor(() => expect(handleClose).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('rename_file', { fromPath: '/n/old', toPath: '/n/new' });
  });
});
