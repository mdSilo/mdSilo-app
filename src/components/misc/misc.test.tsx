import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import Toggle from './Toggle';
import Spinner from './Spinner';
import Portal from './Portal';
import ErrorBoundary from './ErrorBoundary';
import Tree, { type TreeNode } from './Tree';
import TreeNodeElement from './TreeNodeElement';
import VirtualTree from './VirtualTree';
import Dropdown, { DropdownItem } from './Dropdown';
import Tooltip from './Tooltip';

describe('Toggle', () => {
  test('toggles via its checkbox', async () => {
    const setIsChecked = vi.fn();
    const { rerender } = render(<Toggle id="t" isChecked={false} setIsChecked={setIsChecked} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(setIsChecked).toHaveBeenCalledWith(true);

    rerender(<Toggle id="t" isChecked={true} setIsChecked={setIsChecked} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(setIsChecked).toHaveBeenLastCalledWith(false);
  });
});

describe('Spinner', () => {
  test('renders with extra classes', () => {
    render(<Spinner className="w-8" />);
    expect(screen.getByTestId('spinner')).toHaveClass('animate-spin', 'w-8');
  });
});

describe('Portal', () => {
  test('renders into #app-container by default', () => {
    const container = document.createElement('div');
    container.id = 'app-container';
    document.body.appendChild(container);
    render(<Portal><span>in portal</span></Portal>);
    expect(container).toHaveTextContent('in portal');
    container.remove();
  });

  test('renders into a custom selector and nothing when missing', () => {
    const target = document.createElement('div');
    target.className = 'target';
    document.body.appendChild(target);
    render(<Portal selector=".target"><span>custom</span></Portal>);
    expect(target).toHaveTextContent('custom');
    target.remove();

    render(<Portal selector=".missing"><span>lost</span></Portal>);
    expect(screen.queryByText('lost')).not.toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  const Boom = () => {
    throw new Error('kaboom');
  };

  test('renders children when fine', () => {
    render(<ErrorBoundary><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  test('renders the default fallback and logs the error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('set_log', {
      logData: [expect.objectContaining({ ty: 'Error', info: expect.stringContaining('kaboom') })],
    });
    vi.restoreAllMocks();
  });

  test('renders a custom fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ErrorBoundary fallback={<p>custom fallback</p>}><Boom /></ErrorBoundary>);
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

const treeData: TreeNode[] = [
  {
    id: 'root',
    labelNode: <span>Root</span>,
    children: [
      { id: 'child', labelNode: <span>Child</span>, children: [{ id: 'leaf', labelNode: <span>Leaf</span> }] },
      { id: 'plain', labelNode: <span>Plain</span>, showArrow: false },
    ],
  },
  { id: 'other', labelNode: <span>Other</span> },
];

describe('Tree', () => {
  test('renders all nodes expanded by default', () => {
    render(<Tree data={treeData} />);
    for (const label of ['Root', 'Child', 'Leaf', 'Plain', 'Other']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('collapses and expands on click', async () => {
    render(<Tree data={treeData} />);
    await userEvent.click(screen.getByText('Child'));
    expect(screen.queryByText('Leaf')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Child'));
    expect(screen.getByText('Leaf')).toBeInTheDocument();
  });

  test('collapseAll hides children of top-level nodes', async () => {
    render(<Tree data={treeData} collapseAll />);
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Root'));
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  test('collapseIds collapses given nodes', () => {
    render(<Tree data={treeData} collapseIds={['child']} />);
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.queryByText('Leaf')).not.toBeInTheDocument();
  });

  test('nodes without arrow are not clickable', async () => {
    render(<Tree data={treeData} />);
    const plainRow = screen.getByText('Plain').parentElement as HTMLElement;
    expect(plainRow.querySelector('svg')).toBeNull();
    expect(plainRow).not.toHaveClass('hover:cursor-pointer');
  });
});

describe('TreeNodeElement', () => {
  const base = { id: 'n', labelNode: <span>N</span>, hasChildren: false, collapsed: false };

  test('indents by depth and calls onClick', async () => {
    const onClick = vi.fn();
    const node = { ...base, depth: 2, showArrow: true, toIndent: true };
    render(<TreeNodeElement node={node} onClick={onClick} />);
    const row = screen.getByText('N').parentElement as HTMLElement;
    expect(row).toHaveStyle({ paddingLeft: '32px' });
    await userEvent.click(row);
    expect(onClick).toHaveBeenCalledWith(node);
    expect(row.querySelector('svg')).toHaveClass('rotate-90');
  });

  test('reduces indent when not indenting and pads arrowless nodes', () => {
    const node = { ...base, depth: 2, showArrow: false, toIndent: false };
    render(<TreeNodeElement node={node} onClick={vi.fn()} />);
    expect(screen.getByText('N').parentElement).toHaveStyle({ paddingLeft: '20px' });
  });
});

describe('VirtualTree', () => {
  // react-virtual sizes the parent via getBoundingClientRect and rows via offsetHeight
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300, height: 1000, top: 0, left: 0, bottom: 1000, right: 300, x: 0, y: 0, toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('renders rows and toggles nodes', () => {
    render(<VirtualTree data={treeData} className="h-64" />);
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Leaf')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Root'));
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Root'));
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  test('collapseAll starts collapsed', () => {
    render(<VirtualTree data={treeData} collapseAll />);
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
  });
});

describe('Dropdown', () => {
  const Wrapper = () => {
    const [clicked, setClicked] = useState('');
    return (
      <div id="app-container">
        <p>clicked: {clicked}</p>
        <Dropdown buttonChildren={<span>Menu</span>}>
          <DropdownItem onClick={() => setClicked('first')}>First</DropdownItem>
          <DropdownItem as="a" href="https://mdsilo.com">Link</DropdownItem>
        </Dropdown>
      </div>
    );
  };

  test('opens items and handles clicks', async () => {
    render(<Wrapper />);
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('dropdown-button'));
    expect(screen.getByText('Link').closest('a')).toHaveAttribute('href', 'https://mdsilo.com');
    expect(screen.getByText('Link').closest('a')).toHaveAttribute('target', '_blank');
    await userEvent.click(screen.getByText('First'));
    expect(screen.getByText('clicked: first')).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  test('renders its child', () => {
    render(
      <Tooltip content="tip">
        <button>target</button>
      </Tooltip>
    );
    expect(screen.getByRole('button', { name: 'target' })).toBeInTheDocument();
  });

  test('shows the content on hover, without reading element.ref', async () => {
    const error = vi.spyOn(console, 'error');
    render(
      <Tooltip content={<b>tip text</b>}>
        <button>target</button>
      </Tooltip>
    );
    await userEvent.hover(screen.getByRole('button', { name: 'target' }));
    expect(await screen.findByText('tip text')).toBeInTheDocument();
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/element\.ref/));
    error.mockRestore();
  });

  test('keeps the ref of its child', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Tooltip content="tip">
        <button ref={ref}>target</button>
      </Tooltip>
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: 'target' }));
  });

  test('shows nothing when disabled', async () => {
    render(
      <Tooltip content="hidden tip" disabled>
        <button>target</button>
      </Tooltip>
    );
    await userEvent.hover(screen.getByRole('button', { name: 'target' }));
    expect(screen.queryByText('hidden tip')).not.toBeInTheDocument();
  });
});
