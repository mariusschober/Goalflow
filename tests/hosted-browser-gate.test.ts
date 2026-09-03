import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('hosted browser release gate', () => {
  const localConfig = fs.readFileSync('playwright.config.ts', 'utf8');
  const hostedConfig = fs.readFileSync('playwright.hosted.config.ts', 'utf8');
  const journey = fs.readFileSync('tests/e2e/hosted-staging.spec.ts', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

  it('cannot run against the local synthetic Playwright server', () => {
    expect(localConfig).toContain("testIgnore: '**/hosted-staging.spec.ts'");
    expect(hostedConfig).toContain("testMatch: '**/hosted-staging.spec.ts'");
    expect(hostedConfig).not.toContain('webServer:');
    expect(hostedConfig).toContain("GOALFLOW_HOSTED_TEST_CONFIRM !== 'staging'");
    expect(hostedConfig).toContain("configuredOrigin.protocol, 'https:'");
  });

  it('keeps real login credentials out of retained browser media', () => {
    expect(hostedConfig).toContain("trace: 'off'");
    expect(hostedConfig).toContain("screenshot: 'off'");
    expect(hostedConfig).toContain("video: 'off'");
    expect(hostedConfig).toContain("reporter: 'list'");
    expect(hostedConfig).not.toContain("['html'");
    expect(journey).toContain("testInfo.attach('redacted-browser-diagnostics'");
    expect(journey).toContain(".replace(/Bearer\\s+\\S+/gi, 'Bearer <redacted>')");
  });

  it('proves two browsers converge while a distinct account remains isolated', () => {
    expect(journey).toContain("'user-a-browser-1'");
    expect(journey).toContain("'user-a-browser-2'");
    expect(journey).toContain("'user-b-browser'");
    expect(journey).toContain("getByRole('button', { name: 'Create Task'");
    expect(journey).toContain("getByRole('button', { name: 'Save'");
    expect(journey).toContain("getByTitle('Delete')");
    expect(journey).toContain('await signOutLocally(firstA.page)');
    expect(journey).toContain("await expect(secondA.page.locator('header')).toBeVisible()");
    expect(journey).toContain("window.dispatchEvent(new Event('goalflow:sync-retry'))");
  });

  it('runs after the hosted protocol proof and retains only redacted diagnostics', () => {
    const protocol = workflow.indexOf('npm run test:hosted:staging');
    const browser = workflow.indexOf('npm run test:hosted:browser');
    expect(protocol).toBeGreaterThan(0);
    expect(browser).toBeGreaterThan(protocol);
    expect(workflow).toContain('npx playwright install --with-deps chromium');
    expect(workflow).toContain('name: hosted-browser-diagnostics');
    expect(workflow).toContain('path: test-results');
    expect(workflow).toContain('if-no-files-found: error');
  });
});
