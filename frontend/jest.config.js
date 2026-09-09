/* eslint-disable @typescript-eslint/no-require-imports */
const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  // RTK Query schedules cache-lifetime timers (keepUnusedDataFor) that
  // outlive a component's unmount in tests; force-exit so `npm test` doesn't
  // hang on those instead of requiring --forceExit on every invocation.
  forceExit: true,
};

module.exports = createJestConfig(customJestConfig);
