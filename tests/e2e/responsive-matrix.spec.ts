import { expect, test, type Page } from '@playwright/test'

const responsiveViewports = [
  { name: 'small phone landscape', width: 568, height: 320 },
  { name: 'small landscape', width: 667, height: 375 },
  { name: 'android phone landscape', width: 740, height: 360 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'wide phone landscape', width: 956, height: 440 },
  { name: 'small tablet landscape', width: 1024, height: 600 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'small laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'full HD', width: 1920, height: 1080 },
  { name: 'large desktop', width: 2560, height: 1440 },
] as const

function expectedProfile(width: number, height: number) {
  if (width > height && height <= 600) return 'compact-landscape'
  if (width >= 1280 && height >= 720) return 'wide'
  return 'balanced'
}

async function expectNoRootOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        body: document.body.scrollWidth - document.documentElement.clientWidth,
        root:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      })),
    )
    .toEqual({ body: 0, root: 0 })
}

for (const viewport of responsiveViewports) {
  test(`keeps the whole application usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)

    await page.goto('/explore?country=CN')
    await expect(page.locator('.app-shell')).toHaveAttribute(
      'data-viewport-profile',
      expectedProfile(viewport.width, viewport.height),
    )
    await expectNoRootOverflow(page)

    const navigation = page.getByRole('navigation', {
      name: 'Scio Geo 主导航',
    })
    await expect(navigation).toBeVisible()
    const navigationBox = await navigation.boundingBox()
    expect(navigationBox).not.toBeNull()
    expect(navigationBox!.x).toBeGreaterThanOrEqual(0)
    expect(navigationBox!.y).toBeGreaterThanOrEqual(0)
    expect(navigationBox!.x + navigationBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )

    const scene = page.getByTestId('globe-scene')
    const fallback = page.getByRole('heading', {
      name: '当前设备无法启动 3D 地球',
    })
    await expect(scene.or(fallback)).toBeVisible()
    if (await scene.isVisible()) {
      await expect
        .poll(() =>
          scene.evaluate((element) =>
            Number.parseFloat(
              getComputedStyle(element).getPropertyValue('--scene-safe-left'),
            ),
          ),
        )
        .toBeGreaterThan(0)

      const visibleLabels = scene.locator(
        '[data-map-label-id]:visible:not([hidden])',
      )
      const labelCount = await visibleLabels.count()
      if (labelCount > 0) {
        const layout = await scene.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          const read = (name: string) =>
            Number.parseFloat(style.getPropertyValue(name)) || 0
          return {
            left: box.left + read('--scene-safe-left'),
            right: box.right - read('--scene-safe-right'),
            top: box.top + read('--scene-safe-top'),
            bottom: box.bottom - read('--scene-safe-bottom'),
          }
        })
        const labelBoxes = await visibleLabels.evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect()
            return {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
            }
          }),
        )
        expect(
          labelBoxes.every(
            (box) =>
              box.left >= layout.left - 2 &&
              box.right <= layout.right + 2 &&
              box.top >= layout.top - 2 &&
              box.bottom <= layout.bottom + 2,
          ),
        ).toBe(true)
      }
    }

    const detail = page.getByLabel('中国国家知识卡')
    await expect(detail).toBeVisible()
    await expect(detail.getByRole('heading', { name: '中国' })).toHaveCSS(
      'font-size',
      '20px',
    )
    await expect(
      detail.getByRole('button', { name: '关闭国家知识卡' }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          'text-size-adjust',
        ),
      ),
    ).toBe('100%')

    const [controlsBox, layerBox] = await Promise.all([
      page.getByRole('navigation', { name: '地球显示控制' }).boundingBox(),
      page.getByRole('button', { name: /图层，已开启 \d+ 项/ }).boundingBox(),
    ])
    expect(controlsBox).not.toBeNull()
    expect(layerBox).not.toBeNull()
    expect(
      Math.abs(
        controlsBox!.x + controlsBox!.width - layerBox!.x - layerBox!.width,
      ),
    ).toBeLessThanOrEqual(1)

    await page.goto('/knowledge/countries?continent=asia')
    await expect(page.locator('main')).toHaveAttribute(
      'data-page-scroll',
      'locked',
    )
    await expect(page.getByRole('tablist', { name: '大洲' })).toBeVisible()
    await expect(page.locator('.knowledge-map-card')).toBeVisible()
    await expectNoRootOverflow(page)

    await page.goto('/search')
    await expect(page.locator('main')).toHaveAttribute(
      'data-page-scroll',
      'locked',
    )
    await expect(page.getByRole('combobox', { name: '搜索地点' })).toBeVisible()
    await expect(
      page.getByRole('listbox', { name: '地点搜索结果' }),
    ).toBeVisible()
    await expectNoRootOverflow(page)

    await page.goto('/questions?difficulty=easy')
    await expect(page.locator('main')).toHaveAttribute(
      'data-page-scroll',
      'auto',
    )
    await expect(
      page.getByRole('heading', { name: '知识问答', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByTestId('knowledge-question-continent-asia'),
    ).toBeVisible()
    await expectNoRootOverflow(page)

    await page.goto('/questions/asia/easy')
    await expect(page.locator('main')).toHaveAttribute(
      'data-page-scroll',
      'auto',
    )
    await expect(page.locator('.knowledge-challenge-header')).toBeVisible()
    await expectNoRootOverflow(page)
  })
}
