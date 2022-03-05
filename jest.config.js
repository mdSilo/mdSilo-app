module.exports = {
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  moduleNameMapper: {
    /* Handle CSS imports (with CSS modules)
    https://jestjs.io/docs/webpack#mocking-css-modules */
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',

    // Handle CSS imports (without CSS modules)
    '^.+\\.(css|sass|scss)$': '<rootDir>/src/__mocks__/styleMock.ts',

    /* Handle image imports
    https://jestjs.io/docs/webpack#handling-static-assets */
    '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.ts',

    /* Handle libraries */
    '^d3-force$': '<rootDir>/src/__mocks__/d3-force.ts',
    '^d3-drag$': '<rootDir>/src/__mocks__/d3-drag.ts',
    '^d3-zoom$': '<rootDir>/src/__mocks__/d3-zoom.ts',
    '^d3-selection$': '<rootDir>/src/__mocks__/d3-selection.ts',
    '^unified$': '<rootDir>/src/__mocks__/unified.ts',
    '^remark-parse$': '<rootDir>/src/__mocks__/remark-parse.ts',
    '^remark-gfm$': '<rootDir>/src/__mocks__/remark-gfm.ts',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/cypress/',
    '<rootDir>/__tests__/.eslintrc.js',
  ],
  testEnvironment: 'jsdom',
  transform: { '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', 'ts-jest'] },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>'],
  moduleDirectories: ['node_modules'],
};
