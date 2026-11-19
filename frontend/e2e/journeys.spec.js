// The main journeys, clicked through in a real browser the way a first-time visitor would.
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  // The guided tour opens by itself for new visitors; these tests go straight to the work.
  await page.addInitScript(() => localStorage.setItem('bg_tours_off', '1'))
})

async function startDemo(page, brand, person) {
  await page.goto('/')
  await page.getByRole('radio', { name: new RegExp(brand) }).click()
  await page.getByRole('button', { name: new RegExp(person) }).click()
  await expect(page.getByRole('button', { name: 'Demo menu' })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`Account menu: ${person}`) })).toBeVisible()
}

async function actAs(page, person) {
  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('group', { name: 'Act as' }).getByRole('button', { name: new RegExp(person) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`Account menu: ${person}`) })).toBeVisible()
}

// Press and hold a hold-to-confirm button, then let the undo countdown run out.
async function hold(page, name) {
  const button = page.getByRole('button', { name })
  await button.focus()
  await page.keyboard.down('Enter')
  await page.waitForTimeout(1400)
  await page.keyboard.up('Enter')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden({ timeout: 10_000 })
}

async function noSeriousA11yProblems(page, where) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  expect(serious.map((v) => `${where}: ${v.id} ${v.help}: ` + v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} [${(n.any[0]?.message || '').slice(0, 90)}]`).join(' | '))).toEqual([])
}

test('Lumio: write, fix, send, escalate, waive and approve, with an image', async ({ page }) => {
  await startDemo(page, 'Lumio Payroll', 'Asha')
  await noSeriousA11yProblems(page, 'drafts')

  await page.getByRole('link', { name: 'New draft' }).click()
  await page.getByRole('button', { name: 'Load a sample post' }).click()
  await expect(page.getByText(/issues? found while typing/)).toBeVisible() // live check while typing
  await page.getByRole('button', { name: 'Try the sample image' }).click()
  await expect(page.getByRole('button', { name: /Remove payroll-banner.png/ })).toBeVisible()
  await page.getByRole('textbox', { name: 'Title' }).fill('E2E: onboarding post')
  await noSeriousA11yProblems(page, 'new draft')
  await page.getByRole('button', { name: 'Save and run check' }).click()

  await expect(page.getByRole('heading', { name: 'E2E: onboarding post' })).toBeVisible()
  await expect(page.getByText('“#1”')).toBeVisible()
  await expect(page.getByText(/Colour #[0-9a-f]{6} \(\d+% of the image\)/)).toBeVisible() // off-brand purple panel
  await expect(page.getByText('This image has no description')).toBeVisible()
  await noSeriousA11yProblems(page, 'draft')

  // fix what can be fixed: all low-risk terms at once, the number, and the image description
  // (the check ran on the draft page in two steps)
  await page.getByRole('button', { name: /Apply all \d+ certain fixes/ }).click()
  await expect(page.getByRole('heading', { name: /Applied \d+ certain fixes/ })).toBeVisible() // before and after
  await expect(page.getByText('Lumio Payroll is now India').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Content' }).locator('xpath=../../..')).toContainText('trusted by 8,200 companies')
  const alt = page.locator('[id^=finding-]').filter({ hasText: 'This image has no description' })
  await alt.getByRole('button', { name: 'Write my own description' }).click()
  await alt.getByRole('textbox').fill('Banner: India’s payroll app, with the Lumio logo on a purple panel.')
  await alt.getByRole('button', { name: 'Save description' }).click()
  await expect(page.locator('[id^=finding-]').filter({ hasText: 'This image has no description' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Run check' }).click()
  await page.getByRole('button', { name: 'Send for review' }).click()
  await expect(page.getByText('In review').first()).toBeVisible()

  // the manager approves; high-risk findings are still open, so it goes to the brand owner
  await actAs(page, 'Rohan')
  await page.getByRole('link', { name: /E2E: onboarding post/ }).click()
  await hold(page, /Hold to approve and escalate/)
  await expect(page.getByText('Authorised review').first()).toBeVisible()

  // the brand owner waives each high-risk finding with a reason, then approves
  await actAs(page, 'Meera')
  await page.getByRole('link', { name: /E2E: onboarding post/ }).click()
  // only high-risk findings block approval
  const highRisk = page.locator('[id^=finding-]').filter({ hasText: 'High risk' })
  await expect(highRisk.first()).toBeVisible()
  for (let n = 0; n < 8 && (await highRisk.count()); n++) {
    await highRisk.first().getByRole('button', { name: 'Waive', exact: true }).click()
    await page.getByPlaceholder('Why is it acceptable to publish with this?').fill('Accepted for this test campaign by the brand owner.')
    await hold(page, /Hold to waive with this reason/)
  }
  await hold(page, /^Hold to approve/)
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Approval record' }).click()
  await expect(page.getByText('BrandGuard AI · Approval record')).toBeVisible()
  await noSeriousA11yProblems(page, 'record')
})

test('Fizzbox: hype is on-brand, health claims are not', async ({ page }) => {
  await startDemo(page, 'Fizzbox', 'Kabir')
  await page.getByRole('link', { name: 'New draft' }).click()
  await page.getByRole('textbox', { name: 'Title' }).fill('E2E: mango drop')
  await page.locator('#body').fill('BUY NOW! The new mango fizz is here. Healthy and fun for everyone.')
  await expect(page.getByText(/issues? found while typing/)).toBeVisible()
  await expect(page.locator('mark.live-mark', { hasText: 'Healthy' })).toHaveCount(1)
  await expect(page.locator('mark.live-mark', { hasText: 'BUY NOW' })).toHaveCount(0) // capitals for a short call to action are fine here
})

test('A new brand: sign up, add a teammate, write, and have it approved by someone else', async ({ page }) => {
  const stamp = Date.now()
  await page.goto('/')
  await page.getByRole('tab', { name: /Create/ }).click()
  await page.getByRole('textbox', { name: 'Brand name' }).fill(`E2E Tea ${stamp}`)
  await page.getByRole('textbox', { name: 'Your name' }).fill('Owner One')
  await page.getByRole('textbox', { name: 'Email' }).fill(`owner${stamp}@e2e.test`)
  await page.getByLabel('Password').fill('a-long-password')
  await page.getByRole('button', { name: 'Create brand and sign in' }).click()
  await expect(page.getByRole('heading', { name: `Get E2E Tea ${stamp} started` })).toBeVisible()

  await page.getByRole('link', { name: 'Team', exact: true }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Manny Manager')
  await page.getByRole('textbox', { name: 'Email' }).fill(`manny${stamp}@e2e.test`)
  await page.locator('form').getByRole('combobox').selectOption('manager')
  await page.getByRole('textbox', { name: 'Starting password' }).fill('manny-password')
  await page.getByRole('button', { name: /Add to E2E Tea/ }).click()
  await expect(page.getByText(/Manny Manager can now sign in as Manager/)).toBeVisible()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Drafts' }).click()
  await page.getByRole('link', { name: 'New draft' }).click()
  await page.getByRole('textbox', { name: 'Title' }).fill('First tea post')
  await page.locator('#body').fill('Our new green tea is calm, fresh and ready for your morning.')
  await page.getByRole('button', { name: 'Save and run check' }).click()
  await expect(page.getByRole('heading', { name: 'First tea post' })).toBeVisible()
  await page.getByRole('button', { name: 'Send for review' }).click()
  await expect(page.getByText(/You wrote this draft, so someone else/)).toBeVisible() // nobody approves their own work

  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('tab', { name: /Sign in/ }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill(`manny${stamp}@e2e.test`)
  await page.getByLabel('Password').fill('manny-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: /First tea post/ }).click()
  await hold(page, /^Hold to approve/)
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
})

test('Pages explain themselves and pass an accessibility scan', async ({ page }) => {
  await page.goto('/')
  await noSeriousA11yProblems(page, 'sign-in')
  await startDemo(page, 'Lumio Payroll', 'Meera')
  for (const [link, heading] of [['Brand health', 'Brand health'], ['Brand Library', 'Brand Library'], ['Reliability', 'Reliability'], ['Team', 'Team']]) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await noSeriousA11yProblems(page, link)
  }
  await expect(page.getByRole('heading', { name: 'Guideline gaps' })).toBeHidden() // on Team now
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Go to a page or draft' }).fill('library')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Brand Library', exact: true })).toBeVisible()
})
