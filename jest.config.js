const path = require('path');

module.exports = {
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
  modulePathIgnorePatterns: [
    '<rootDir>/internals',
    '<rootDir>/playwright',
    '<rootDir>/stories',
    '__snapshots__',
  ],
  collectCoverageFrom: [
    '<rootDir>/src/app/**/*.{js,jsx,ts,tsx}',
    '!**/*.json',
    '!<rootDir>/**/*.d.ts',
    '!<rootDir>/src/app/assets**/*.{js,jsx,ts,tsx}',
    '!<rootDir>/src/app/scripts**/*.{js,jsx,ts,tsx}',
    '!<rootDir>/src/app/**/*.test.{js,jsx,ts,tsx}',
  ],
  setupFiles: [
    'react-app-polyfill/jsdom',
  ],
  setupFilesAfterEnv: [
    path.resolve(__dirname, './src/setupTests.js'),
  ],
  testMatch: [
    '<rootDir>/**/tests/**/*.test.{js,jsx,ts,tsx}',
  ],
  testEnvironment: 'jest-environment-jsdom-global',
  moduleNameMapper: {
    '^.+\\.module\\.(css|sass|scss)$': 'identity-object-mapper',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga|css|pdf)$': '<rootDir>/config/jest/fileMock.js',
    '^assets(.*)$': '<rootDir>/src/assets$1',
    '^stories(.*)$': '<rootDir>/src/stories$1',
    '^scripts(.*)$': '<rootDir>/src/scripts$1',
    '^components(.*)$': '<rootDir>/src/app/components$1',
    '^hocs(.*)$': '<rootDir>/src/app/hocs$1',
  },
};
