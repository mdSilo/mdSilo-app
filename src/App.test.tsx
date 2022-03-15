import React from 'react';
import { render, screen } from '@testing-library/react';
import * as fileUtil from 'file/util';
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
  expect(screen.getByText('mdSilo')).toBeInTheDocument();
})

test('file util', () => {
  expect(fileUtil.normalizeSlash('C:/')).toBe('C:');
  expect(fileUtil.normalizeSlash('C:\\Files\\mdsilo\\app.msi')).toBe('C:/Files/mdsilo/app.msi');
  expect(fileUtil.joinPath(...['/', 'md', '/silo/'])).toBe('/md/silo');
  expect(fileUtil.trimSlashAll('/\\md/silo\\')).toBe('md/silo');
})
