import { expect, test, type Locator, type Page } from '@playwright/test'

const frameViewports = [
  { name: 'small phone landscape', width: 568, height: 320 },
  { name: 'small landscape', width: 667, height: 375 },
  { name: 'android phone landscape', width: 740, height: 360 },
  { name: 'phone landscape', width: 844, height: 390 },
  {
    name: 'iPhone 16 Pro Max landscape',
    width: 956,
    height: 440,
    safeInline: 59,
    safeBottom: 34,
  },
  { name: 'small tablet landscape', width: 1024, height: 600 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'small laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'full HD', width: 1920, height: 1080 },
  { name: 'large desktop', width: 2560, height: 1440 },
] as const

const detailPages = [
  {
    name: 'country',
    url: '/knowledge/countries/east-asia',
    cardLabel: '东亚区域知识',
    primaryContent: '.knowledge-region-browser',
  },
  {
    name: 'earth line',
    url: '/knowledge/earth/lines/equator',
    cardLabel: '赤道经纬线详情',
    primaryContent: '.knowledge-earth-map-card',
  },
  {
    name: 'water object',
    url: '/knowledge/water/groups/ocean-seas?object=mediterranean-sea',
    cardLabel: '地中海海详情',
    primaryContent: '.knowledge-earth-map-card',
  },
  {
    name: 'world extreme',
    url: '/knowledge/extremes/metrics/highest-peak?entry=mount-everest',
    cardLabel: '珠穆朗玛峰世界之最详情',
    primaryContent: '.knowledge-earth-map-card',
  },
] as const

function getLayoutSpacing(width: number, height: number) {
  if (width <= 956 && height <= 600) {
    return Math.min(8, Math.max(4, width * 0.01))
  }
  return Math.min(12, Math.max(8, width * 0.012))
}

async function applySafeArea(page: Page, safeInline = 0, safeBottom = 0) {
  if (safeInline === 0 && safeBottom === 0) return
  await page.evaluate(
    ({ bottom, inline }) => {
      document.documentElement.style.setProperty(
        '--atlas-safe-area-left',
        `${inline}px`,
      )
      document.documentElement.style.setProperty(
        '--atlas-safe-area-right',
        `${inline}px`,
      )
      document.documentElement.style.setProperty(
        '--atlas-safe-area-bottom',
        `${bottom}px`,
      )
      window.dispatchEvent(new Event('resize'))
    },
    { bottom: safeBottom, inline: safeInline },
  )
}

async function waitForAnimations(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        element
          .getAnimations()
          .every((animation) => animation.playState === 'finished'),
      ),
    )
    .toBe(true)
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

for (const viewport of frameViewports) {
  test(`aligns the complete application frame on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const spacing = getLayoutSpacing(viewport.width, viewport.height)
    const safeInline = 'safeInline' in viewport ? viewport.safeInline : 0
    const safeBottom = 'safeBottom' in viewport ? viewport.safeBottom : 0
    const horizontalEdge = Math.max(spacing, safeInline)
    const contentBottom = spacing

    for (const detailPage of detailPages) {
      await page.goto(detailPage.url)
      await applySafeArea(page, safeInline, safeBottom)

      const navigation = page.getByRole('navigation', {
        name: 'Scio Geo 主导航',
      })
      const study = page.locator('.knowledge-detail-study')
      const primaryContent = page.locator(detailPage.primaryContent).first()
      const card = page.getByLabel(detailPage.cardLabel)
      await expect(primaryContent).toBeVisible()
      await expect(card).toBeVisible()
      await waitForAnimations(card)

      const [navigationBox, studyBox, primaryBox, cardBox] = await Promise.all([
        navigation.boundingBox(),
        study.boundingBox(),
        primaryContent.boundingBox(),
        card.boundingBox(),
      ])
      expect(navigationBox).not.toBeNull()
      expect(studyBox).not.toBeNull()
      expect(primaryBox).not.toBeNull()
      expect(cardBox).not.toBeNull()

      expect(navigationBox!.x).toBeCloseTo(horizontalEdge, 0)
      expect(navigationBox!.y).toBeCloseTo(spacing, 0)
      expect(studyBox!.x - navigationBox!.x - navigationBox!.width).toBeCloseTo(
        spacing,
        0,
      )
      expect(studyBox!.y).toBeCloseTo(spacing, 0)
      if (detailPage.name === 'country') {
        expect(primaryBox!.y).toBeCloseTo(spacing, 0)
      } else {
        expect(primaryBox!.y).toBeGreaterThanOrEqual(studyBox!.y)
      }
      expect(cardBox!.y).toBeCloseTo(spacing, 0)
      expect(cardBox!.x - studyBox!.x - studyBox!.width).toBeCloseTo(spacing, 0)
      expect(viewport.width - cardBox!.x - cardBox!.width).toBeCloseTo(
        horizontalEdge,
        0,
      )
      expect(viewport.height - cardBox!.y - cardBox!.height).toBeCloseTo(
        spacing,
        0,
      )
      expect(cardBox!.y).toBeCloseTo(
        viewport.height - cardBox!.y - cardBox!.height,
        0,
      )
      const cardSafety = await card.evaluate((element) => {
        const content = element.querySelector('.knowledge-card-content')
        return {
          contentBottom: content?.getBoundingClientRect().bottom ?? null,
          paddingBottom: Number.parseFloat(
            getComputedStyle(element).paddingBottom,
          ),
        }
      })
      expect(cardSafety.paddingBottom).toBe(0)
      if (cardSafety.contentBottom !== null) {
        expect(cardSafety.contentBottom).toBeLessThanOrEqual(
          viewport.height - spacing + 1,
        )
      }
      if (detailPage.name === 'country') {
        const fieldControl = page.locator(
          '.knowledge-country-display-controls:not([hidden]), .knowledge-country-menu-trigger',
        )
        await expect(fieldControl).toHaveCount(1)
        const fieldControlBox = await fieldControl.boundingBox()
        expect(fieldControlBox).not.toBeNull()
        expect(fieldControlBox!.x).toBeCloseTo(navigationBox!.x, 0)
        expect(
          fieldControlBox!.y - navigationBox!.y - navigationBox!.height,
        ).toBeCloseTo(spacing, 0)
      }
      await expectNoRootOverflow(page)
    }

    await page.goto('/knowledge/countries')
    await applySafeArea(page, safeInline, safeBottom)
    await expect(page.locator('.knowledge-map-workbench')).toBeVisible()
    const shellPadding = await page.locator('main').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        top: Number.parseFloat(style.paddingTop),
        right: Number.parseFloat(style.paddingRight),
        bottom: Number.parseFloat(style.paddingBottom),
        left: Number.parseFloat(style.paddingLeft),
      }
    })
    const overviewNavigationBox = await page
      .getByRole('navigation', { name: 'Scio Geo 主导航' })
      .boundingBox()
    expect(overviewNavigationBox).not.toBeNull()
    expect(shellPadding.top).toBeCloseTo(spacing, 0)
    expect(shellPadding.right).toBeCloseTo(horizontalEdge, 0)
    expect(shellPadding.bottom).toBeCloseTo(contentBottom, 0)
    expect(shellPadding.left).toBeCloseTo(
      horizontalEdge + overviewNavigationBox!.width + spacing,
      0,
    )
    await expectNoRootOverflow(page)

    for (const route of ['/search', '/questions']) {
      await page.goto(route)
      await applySafeArea(page, safeInline, safeBottom)
      if (route === '/search') {
        await expect(
          page.getByRole('combobox', { name: '搜索地点' }),
        ).toBeVisible()
      } else {
        await expect(
          page.locator('.knowledge-question-hub-overview'),
        ).toBeVisible()
      }
      const padding = await page.locator('main').evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          top: Number.parseFloat(style.paddingTop),
          right: Number.parseFloat(style.paddingRight),
          bottom: Number.parseFloat(style.paddingBottom),
        }
      })
      expect(padding.top).toBeCloseTo(spacing, 0)
      expect(padding.right).toBeCloseTo(horizontalEdge, 0)
      expect(padding.bottom).toBeCloseTo(contentBottom, 0)
      await expectNoRootOverflow(page)
    }

    await page.goto('/explore?country=CN')
    const controlDock = page.locator('.control-dock')
    await expect(controlDock).toBeVisible()
    const controlDockBaseline = await controlDock.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        height: element.getBoundingClientRect().height,
        paddingTop: Number.parseFloat(style.paddingTop),
        paddingBottom: Number.parseFloat(style.paddingBottom),
      }
    })
    await applySafeArea(page, safeInline, safeBottom)
    const exploreNavigation = page.getByRole('navigation', {
      name: 'Scio Geo 主导航',
    })
    const exploreCard = page.getByLabel('中国国家知识卡')
    await expect(exploreCard).toBeVisible()
    await page.waitForTimeout(400)
    const [exploreNavigationBox, exploreCardBox] = await Promise.all([
      exploreNavigation.boundingBox(),
      exploreCard.boundingBox(),
    ])
    expect(exploreNavigationBox).not.toBeNull()
    expect(exploreCardBox).not.toBeNull()
    expect(exploreNavigationBox!.x).toBeCloseTo(horizontalEdge, 0)
    expect(exploreNavigationBox!.y).toBeCloseTo(spacing, 0)
    expect(exploreCardBox!.y).toBeCloseTo(spacing, 0)
    expect(
      viewport.width - exploreCardBox!.x - exploreCardBox!.width,
    ).toBeCloseTo(horizontalEdge, 0)
    expect(
      viewport.height - exploreCardBox!.y - exploreCardBox!.height,
    ).toBeCloseTo(spacing, 0)
    const [
      exploreCardSafety,
      miniMapBox,
      controlDockBox,
      controlDockLayout,
      controlButtonBoxes,
    ] = await Promise.all([
      exploreCard.evaluate((element) => {
        const content = element.querySelector('.knowledge-card-content')
        return {
          contentBottom: content?.getBoundingClientRect().bottom ?? null,
          paddingBottom: Number.parseFloat(
            getComputedStyle(element).paddingBottom,
          ),
        }
      }),
      page.locator('.world-mini-map').boundingBox(),
      controlDock.boundingBox(),
      controlDock.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          height: element.getBoundingClientRect().height,
          paddingTop: Number.parseFloat(style.paddingTop),
          paddingBottom: Number.parseFloat(style.paddingBottom),
        }
      }),
      controlDock.locator('.control-button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect()
          return { height: box.height, top: box.top, bottom: box.bottom }
        }),
      ),
    ])
    expect(exploreCardSafety.paddingBottom).toBe(0)
    expect(miniMapBox).not.toBeNull()
    expect(controlDockBox).not.toBeNull()
    if (viewport.width > 760) {
      expect(viewport.height - miniMapBox!.y - miniMapBox!.height).toBeCloseTo(
        spacing,
        0,
      )
    }
    expect(
      viewport.height - controlDockBox!.y - controlDockBox!.height,
    ).toBeCloseTo(spacing, 0)
    expect(controlDockLayout.height).toBeCloseTo(controlDockBaseline.height, 0)
    expect(controlDockLayout.paddingTop).toBeCloseTo(
      controlDockLayout.paddingBottom,
      5,
    )
    expect(controlDockLayout.paddingTop).toBeCloseTo(
      controlDockBaseline.paddingTop,
      5,
    )
    expect(controlDockLayout.paddingBottom).toBeCloseTo(
      controlDockBaseline.paddingBottom,
      5,
    )
    expect(controlButtonBoxes).toHaveLength(3)
    expect(
      controlButtonBoxes.every(
        ({ bottom, height, top }) =>
          height >= 44 &&
          top >= controlDockBox!.y + controlDockLayout.paddingTop - 1 &&
          bottom <=
            controlDockBox!.y +
              controlDockBox!.height -
              controlDockLayout.paddingBottom +
              1,
      ),
    ).toBe(true)
    await expectNoRootOverflow(page)
  })
}

test('uses the shared six pixel radius for rectangular interface surfaces', async ({
  page,
}) => {
  await page.setViewportSize({ width: 956, height: 440 })
  const expectSharedRadius = async (locator: Locator) => {
    await expect(locator).toBeVisible()
    await expect(locator).toHaveCSS('border-radius', '6px')
  }

  await page.goto('/knowledge/countries/east-asia')
  await Promise.all([
    expectSharedRadius(page.locator('.app-navigation')),
    expectSharedRadius(page.locator('.knowledge-card-shell')),
    expectSharedRadius(page.locator('.knowledge-region-map-strip')),
    expectSharedRadius(page.locator('.knowledge-region-switcher a').first()),
    expectSharedRadius(page.locator('.knowledge-country-card').first()),
    expectSharedRadius(
      page.locator('.knowledge-country-display-controls button').first(),
    ),
  ])
  await expect(
    page.locator('.knowledge-country-card .country-flag-frame').first(),
  ).not.toHaveCSS('border-radius', '6px')

  await page.goto('/search')
  await Promise.all([
    expectSharedRadius(page.locator('.country-search-field')),
    expectSharedRadius(page.locator('.country-search-popover')),
    expectSharedRadius(
      page.locator('.country-search-popover li > button').first(),
    ),
  ])

  await page.addInitScript(() => {
    Math.random = () => 0
  })
  await page.goto('/questions/asia/easy')
  await expectSharedRadius(page.locator('.knowledge-question-option').first())

  await page.goto('/explore')
  const layerTrigger = page.getByRole('button', {
    name: /图层，已开启 \d+ 项/,
  })
  await layerTrigger.click()
  await Promise.all([
    expectSharedRadius(layerTrigger),
    expectSharedRadius(page.getByRole('region', { name: '图层选择' })),
    expectSharedRadius(page.locator('.control-dock')),
    expectSharedRadius(page.locator('.world-mini-map-card')),
  ])
  await expect(layerTrigger.locator('strong')).toHaveCSS(
    'border-radius',
    '999px',
  )
})
