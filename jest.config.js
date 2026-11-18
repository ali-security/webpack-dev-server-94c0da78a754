"use strict";

module.exports = {
  testURL: "http://localhost/",
  collectCoverage: false,
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/test/",
    "<rootDir>/client/",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/bin/this/process-arguments.js",
    // puppeteer 13 predates mac-arm64 support: on Apple Silicon runners its
    // Chromium wedges the jest worker with no output, so e2e runs on Linux/Windows only
    ...(process.platform === "darwin" ? ["<rootDir>/test/e2e/"] : []),
  ],
  snapshotResolver: "<rootDir>/test/helpers/snapshotResolver.js",
  setupFilesAfterEnv: ["<rootDir>/setupTest.js"],
  globalSetup: "<rootDir>/globalSetupTest.js",
};
