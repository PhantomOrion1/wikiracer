// Automated security, failure-mode and smoke tests for WikiRacer.
// Run: cd tests && npx playwright test   (starts a local static server on :8799)
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: '.',
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  // bypassCSP lets the test harness poll page state; the CSP test opens its own context without it.
  use: { baseURL: 'http://localhost:8799', trace: 'retain-on-failure', bypassCSP: true },
  webServer: [
    { command: 'python3 -m http.server 8799 --directory ..', port: 8799, reuseExistingServer: true },
    { command: 'npx peerjs --port 9010 --path / --allow_discovery false', port: 9010, reuseExistingServer: true },
  ],
  projects: [
    { name: 'chrome', use: { channel: 'chrome' }, testIgnore: /smoke\.spec|quickmatch-load|bots\.spec/ },
    // Shares the test public rooms with other quick-match tests, so it runs on its own afterwards.
    { name: 'load', use: { channel: 'chrome' }, testMatch: /quickmatch-load|bots\.spec/, dependencies: ['chrome'] },
    { name: 'smoke-chrome', use: { channel: 'chrome' }, testMatch: /smoke\.spec/ },
    { name: 'smoke-webkit', use: { browserName: 'webkit' }, testMatch: /smoke\.spec/ },
    { name: 'smoke-iphone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, testMatch: /smoke\.spec/ },
  ],
});
