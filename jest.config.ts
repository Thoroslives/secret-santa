import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // tsconfig.jest.json extends tsconfig.json but lowers JSX to the
      // automatic runtime so .tsx component tests run (the app config uses
      // jsx:"preserve", which jest cannot execute directly).
      tsconfig: 'tsconfig.jest.json',
    }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    '!**/*.d.ts',
  ],
};

export default config;
