import { expect, test } from '@playwright/test'
import { authenticate, mockHermesApi, TEST_ACCESS_KEY } from './fixtures'

test('renders authenticated shell and navigates between key product routes', async ({ page }) => {
  await authenticate(page, TEST_ACCESS_KEY, 'research')
  const api = await mockHermesApi(page)

  await page.goto('/#/hermes/jobs')

  await expect(page.getByRole('heading', { name: 'Scheduled Jobs' })).toBeVisible()
  await expect(page.getByText('Nightly Smoke')).toBeVisible()

  const jobsRequest = api.requests.find((request) => request.pathname === '/api/hermes/jobs')
  expect(jobsRequest?.headers.authorization).toBe(`Bearer ${TEST_ACCESS_KEY}`)
  expect(jobsRequest?.headers['x-hermes-profile']).toBe('research')
  const cronHistoryRequest = api.requests.find((request) => request.pathname === '/api/cron-history')
  expect(cronHistoryRequest?.headers['x-hermes-profile']).toBe('research')

  const configSidebar = page.locator('aside.hermes-config-sidebar')
  const settingsLink = configSidebar.getByRole('link', { name: /^Settings$/ })
  await expect(settingsLink).toHaveAttribute('href', '#/hermes/config/settings')
  await settingsLink.click()
  await expect(page).toHaveURL(/#\/hermes\/config\/settings$/)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const returnLink = configSidebar.getByRole('link', { name: /^Back$/ })
  await expect(returnLink).toHaveAttribute('href', '#/hermes/chat')
  await returnLink.click()
  await expect(page).toHaveURL(/#\/hermes\/chat$/)

  const modelsButton = page.locator('.page-sidebar-nav').getByRole('button', { name: /^Models$/ })
  await modelsButton.click()
  await expect(page).toHaveURL(/#\/hermes\/models$/)
  await expect(page.getByRole('heading', { name: 'Models', exact: true })).toBeVisible()
  await expect(page.getByText('test-model').first()).toBeVisible()

  // 主页侧栏「模型」下方有独立的 Hermes Agent 配置入口。
  await page.goto('/#/hermes/chat')
  const agentConfigButton = page
    .locator('.page-sidebar-nav')
    .getByRole('button', { name: /^Hermes Agent config$/ })
  await expect(agentConfigButton).toBeVisible()
  await agentConfigButton.click()
  await expect(page).toHaveURL(/#\/hermes\/config\/settings$/)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Max Turns', { exact: true })).toBeVisible()

  expect(api.unexpectedRequests).toEqual([])
})
