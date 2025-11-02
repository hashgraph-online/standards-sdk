const coverageScope = process.env.JEST_COVERAGE_SCOPE
  ? [process.env.JEST_COVERAGE_SCOPE]
  : ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'];
const coverageThreshold = process.env.JEST_COVERAGE_SCOPE
  ? {
      global: {
        branches: 0,
        functions: 0,
        lines: 0,
        statements: 0,
      },
    }
  : {
      global: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    };

module.exports = {
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  testEnvironment: './jest-environment-hedera.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^file-type$': '<rootDir>/__mocks__/file-type.js',
    '^../src$': '<rootDir>/src',
  },
  collectCoverage: true,
  collectCoverageFrom: coverageScope,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold,
};
