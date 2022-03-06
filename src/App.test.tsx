import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './components/App';

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
})

test('renders App component', () => {
  render(<App />);
  const linkElement = screen.getByText('mdSilo');
  expect(linkElement).toBeInTheDocument();
})
