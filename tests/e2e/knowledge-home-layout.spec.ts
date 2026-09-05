import { expect, test } from '@playwright/test'

const knowledgeMapViewports: ReadonlyArray<{
  name: string
  width: number
  height: number
  safeArea?: number
}> = [
  { name: '1440 desktop', width: 1440, height: 900 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'phone landscape', width: 844, height: 390 },
  {
    name: 'iPhone 16 Pro Max landscape',
    width: 956,
    height: 440,
    safeArea: 59,
  },
]

for (const viewport of knowledgeMapViewports) {
  test(`keeps the unified knowledge home usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/knowledge?continent=asia')
    if (viewport.safeArea) {
      await page.evaluate(async (safeArea) => {
        document.documentElement.style.setProperty(
          '--atlas-safe-area-left',
          `${safeArea}px`,
        )
        document.documentElement.style.setProperty(
          '--atlas-safe-area-right',
          `${safeArea}px`,
        )
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
      }, viewport.safeArea)
    }

    await expect(
      page.getByRole('heading', { name: '图鉴', level: 1 }),
    ).toBeVisible()
    await expect(page.locator('main')).toHaveAttribute(
      'data-page-scroll',
      'auto',
    )
    await expect(page.getByRole('link', { name: '图鉴' })).toHaveClass(
      /is-active/,
    )
    await expect(
      page.getByRole('navigation', { name: '知识二级菜单' }),
    ).toHaveCount(0)
    await expect(
      page
        .getByRole('navigation', { name: 'Scio Geo 主导航' })
        .getByRole('link', { name: '知识问答' }),
    ).toHaveCount(0)

    await expect(page.getByText('选择内容开始学习')).toBeVisible()
    await expect(page.getByText('LEARN')).toHaveCount(0)
    await expect(page.getByText('CHALLENGE')).toHaveCount(0)
    await expect(page.getByText('开始学习', { exact: true })).toHaveCount(0)
    await expect(page.getByText('进入知识问答', { exact: true })).toHaveCount(0)

    const learningRegion = page.getByRole('region', { name: '图鉴模块' })
    const questionRegion = page.getByRole('region', { name: '问答模块' })
    const moduleCards = learningRegion.locator('.knowledge-home-card')
    const questionCards = questionRegion.locator('.knowledge-home-card')
    await expect(moduleCards).toHaveCount(4)
    await expect(questionCards).toHaveCount(1)
    await expect(questionCards.first()).toBeVisible()

    const geometry = await moduleCards.evaluateAll((cards) => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainClientHeight: document.querySelector('main')!.clientHeight,
      mainScrollHeight: document.querySelector('main')!.scrollHeight,
      navigationLeft: document
        .querySelector('.app-navigation')!
        .getBoundingClientRect().left,
      navigationRight: document
        .querySelector('.app-navigation')!
        .getBoundingClientRect().right,
      cards: cards.map((card) => {
        const box = card.getBoundingClientRect()
        return {
          x: box.x,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        }
      }),
    }))
    const questionBox = await questionCards.first().boundingBox()

    expect(geometry.documentWidth).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    )
    expect(geometry.mainScrollHeight).toBeLessThanOrEqual(
      geometry.mainClientHeight + 1,
    )
    expect(
      geometry.cards.every(
        (card) => card.right <= geometry.viewportWidth + 1 && card.height >= 64,
      ),
    ).toBe(true)
    expect(geometry.cards[0].x).toBeGreaterThanOrEqual(
      geometry.navigationRight + 4,
    )
    expect(geometry.navigationLeft).toBeGreaterThanOrEqual(
      viewport.safeArea ?? 0,
    )
    expect(geometry.cards.at(-1)!.right).toBeLessThanOrEqual(
      geometry.viewportWidth - (viewport.safeArea ?? 0) + 1,
    )
    expect(
      Math.max(...geometry.cards.map((card) => card.top)) -
        Math.min(...geometry.cards.map((card) => card.top)),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.max(...geometry.cards.map((card) => card.width)) -
        Math.min(...geometry.cards.map((card) => card.width)),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.max(...geometry.cards.map((card) => card.height)) -
        Math.min(...geometry.cards.map((card) => card.height)),
    ).toBeLessThanOrEqual(1)
    expect(questionBox).not.toBeNull()
    expect(questionBox!.y).toBeGreaterThanOrEqual(
      Math.max(...geometry.cards.map((card) => card.bottom)),
    )
    expect(questionBox!.x).toBeCloseTo(geometry.cards[0].x, 0)
    expect(questionBox!.width).toBeCloseTo(geometry.cards[0].width, 0)

    if (viewport.safeArea) {
      await page
        .getByRole('navigation', { name: 'Scio Geo 主导航' })
        .getByRole('link', { name: '探索地球', exact: true })
        .click()
      const exploreShell = page.locator('.explore-shell')
      const layerControl = page.locator('.layer-control')
      await expect(exploreShell).toBeVisible()
      await expect(layerControl).toBeVisible()
      const exploreSafeArea = await page.evaluate(() => {
        const navigation = document
          .querySelector('.app-navigation')!
          .getBoundingClientRect()
        const layer = document
          .querySelector('.layer-control')!
          .getBoundingClientRect()
        return {
          navigationLeft: navigation.left,
          layerRight: layer.right,
          viewportWidth: document.documentElement.clientWidth,
        }
      })
      expect(exploreSafeArea.navigationLeft).toBeGreaterThanOrEqual(
        viewport.safeArea,
      )
      expect(exploreSafeArea.layerRight).toBeLessThanOrEqual(
        exploreSafeArea.viewportWidth - viewport.safeArea + 1,
      )
    }
  })
}

for (const viewport of knowledgeMapViewports) {
  test(`fills the knowledge map frame horizontally on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/knowledge/countries')

    const mapCard = page.locator('.knowledge-map-card')
    const map = page.locator('.knowledge-region-map')
    const countryPaths = map.locator(
      '.knowledge-region-map-countries path[data-country-code]',
    )
    await expect(countryPaths.first()).toBeVisible()

    const cardBox = await mapCard.boundingBox()
    const mapBox = await map.boundingBox()
    const pathBounds = await countryPaths.evaluateAll((paths) => {
      const boxes = paths.map((path) => path.getBoundingClientRect())
      return {
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
      }
    })

    expect(cardBox).not.toBeNull()
    expect(mapBox).not.toBeNull()
    expect(cardBox!.width / cardBox!.height).toBeCloseTo(720 / 340, 2)
    expect(pathBounds.left - mapBox!.x).toBeLessThanOrEqual(2)
    expect(mapBox!.x + mapBox!.width - pathBounds.right).toBeLessThanOrEqual(2)

    await page.getByRole('tab', { name: /大洋洲/ }).click()
    const longRegionName = page.getByText('Australia and New Zealand')
    await expect(longRegionName).toHaveCount(1)
    const longRegionNameLayout = await longRegionName.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      whiteSpace: getComputedStyle(element).whiteSpace,
    }))
    expect(longRegionNameLayout.whiteSpace).toBe('nowrap')
    expect(longRegionNameLayout.scrollHeight).toBeLessThanOrEqual(
      longRegionNameLayout.clientHeight + 1,
    )
  })
}

test('matches selected-continent map colors to the learning region cards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/knowledge/countries')

  const selections = [
    { tab: /亚洲/, regionCount: 5 },
    { tab: /欧洲/, regionCount: 5 },
    { tab: /非洲/, regionCount: 5 },
    { tab: /美洲/, regionCount: 4 },
    { tab: /大洋洲/, regionCount: 4 },
  ]
  const accentSequence = ['#4cc9f0', '#ff8a5b', '#8b8cff', '#f6c453', '#46d1a3']

  for (const selection of selections) {
    const tab = page.getByRole('tab', { name: selection.tab })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.knowledge-category-grid a')).toHaveCount(
      selection.regionCount,
    )

    const cardColors = await page
      .locator('.knowledge-category-grid a')
      .evaluateAll((cards) =>
        cards.map((card) =>
          getComputedStyle(card)
            .getPropertyValue('--knowledge-earth-line-color')
            .trim(),
        ),
      )
    const mapColors = await page
      .locator(
        '.knowledge-region-map-countries path.is-continent, .knowledge-region-map-microstates circle.is-continent',
      )
      .evaluateAll((features) =>
        Array.from(
          new Set(
            features.map((feature) =>
              getComputedStyle(feature)
                .getPropertyValue('--knowledge-region-accent')
                .trim(),
            ),
          ),
        ),
      )

    expect(cardColors).toHaveLength(selection.regionCount)
    expect(cardColors).toEqual(accentSequence.slice(0, selection.regionCount))
    expect(mapColors.sort()).toEqual(cardColors.sort())
  }
})

test('keeps the continent map stable above a single row of region cards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/knowledge/countries')

  await expect(page.locator('.knowledge-topic-grid')).toHaveCount(0)
  await expect(page.getByLabel('国家知识范围')).toHaveCount(0)
  await expect(page.getByText('已开放')).toHaveCount(0)
  await expect(page.getByText('即将开放')).toHaveCount(0)
  await expect(page.locator('.knowledge-map-summary')).toHaveCount(0)
  await expect(page.getByText('尚未挑战')).toHaveCount(0)
  await expect(page.locator('.knowledge-region-progress')).toHaveCount(0)

  const mapCard = page.locator('.knowledge-map-card')
  const regionGrid = page.locator('.knowledge-category-grid')
  const continentTabs = page.getByRole('tablist', { name: '大洲' })
  const tabLayout = await continentTabs.evaluate((element) => {
    const button = element.querySelector<HTMLElement>('[role="tab"]')!
    const chinese = button.querySelector('strong')!.getBoundingClientRect()
    const english = button.querySelector('span')!.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      borderBottomWidth: style.borderBottomWidth,
      flexDirection: getComputedStyle(button).flexDirection,
      chineseFontSize: getComputedStyle(button.querySelector('strong')!)
        .fontSize,
      englishFontSize: getComputedStyle(button.querySelector('span')!).fontSize,
      centerDelta: Math.abs(
        chinese.y + chinese.height / 2 - (english.y + english.height / 2),
      ),
    }
  })
  expect(tabLayout.borderBottomWidth).toBe('0px')
  expect(tabLayout.flexDirection).toBe('row')
  expect(tabLayout.chineseFontSize).toBe('15px')
  expect(tabLayout.englishFontSize).toBe('14px')
  expect(tabLayout.centerDelta).toBeLessThan(3)
  const asiaMapBox = await mapCard.boundingBox()
  const asiaGridBox = await regionGrid.boundingBox()

  expect(asiaMapBox).not.toBeNull()
  expect(asiaGridBox).not.toBeNull()
  expect(asiaGridBox!.y).toBeGreaterThanOrEqual(
    asiaMapBox!.y + asiaMapBox!.height,
  )
  await expect(regionGrid.getByRole('link')).toHaveCount(5)
  await expect(regionGrid.locator('.knowledge-region-index')).toHaveCount(0)

  const firstCard = regionGrid.getByRole('link').first()
  const firstCardLayout = await firstCard.evaluate((element) => {
    const title = element.querySelector('strong')!.getBoundingClientRect()
    const labels = element.querySelectorAll('small')
    const count = labels[0].getBoundingClientRect()
    const english = labels[1]
    const englishBox = english.getBoundingClientRect()
    return {
      countIsRightOfTitle: count.x > title.x,
      headingCenterDelta: Math.abs(
        title.y + title.height / 2 - (count.y + count.height / 2),
      ),
      englishStartsBelowHeading:
        englishBox.y >= Math.max(title.bottom, count.bottom),
      englishWhiteSpace: getComputedStyle(english).whiteSpace,
      borderRadius: getComputedStyle(element).borderRadius,
      borderLeftWidth: getComputedStyle(element).borderLeftWidth,
    }
  })
  expect(firstCardLayout.countIsRightOfTitle).toBe(true)
  expect(firstCardLayout.headingCenterDelta).toBeLessThan(3)
  expect(firstCardLayout.englishStartsBelowHeading).toBe(true)
  expect(firstCardLayout.englishWhiteSpace).toBe('nowrap')
  expect(firstCardLayout.borderRadius).toBe('6px')
  expect(firstCardLayout.borderLeftWidth).toBe('3px')

  const longEnglishName = regionGrid.getByText('South-eastern Asia')
  const longEnglishLayout = await longEnglishName.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }))
  expect(longEnglishLayout.whiteSpace).toBe('nowrap')
  expect(longEnglishLayout.scrollHeight).toBeLessThanOrEqual(
    longEnglishLayout.clientHeight + 1,
  )

  await page
    .locator('.knowledge-region-map-countries path[data-country-code="US"]')
    .click()
  await expect(page.getByRole('tab', { name: /美洲/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const americasMapBox = await mapCard.boundingBox()
  expect(americasMapBox).not.toBeNull()
  expect(americasMapBox!.height).toBeCloseTo(asiaMapBox!.height, 1)
  await expect(regionGrid.getByRole('link')).toHaveCount(4)

  await page.getByRole('tab', { name: /大洋洲/ }).click()
  const oceaniaMapBox = await mapCard.boundingBox()
  expect(oceaniaMapBox).not.toBeNull()
  expect(oceaniaMapBox!.height).toBeCloseTo(asiaMapBox!.height, 1)
  await expect(regionGrid.getByRole('link')).toHaveCount(4)
})

test('keeps compact region cards readable in a horizontal scroller', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/knowledge/countries')

  await expect(page.locator('.knowledge-topic-grid')).toHaveCount(0)
  const regionGrid = page.locator('.knowledge-category-grid')
  const firstCard = regionGrid.getByRole('link').first()
  const dimensions = await regionGrid.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const cards = Array.from(element.querySelectorAll('a')).map((card) => {
      const cardBounds = card.getBoundingClientRect()
      return {
        left: cardBounds.left,
        right: cardBounds.right,
      }
    })
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bounds: { left: bounds.left, right: bounds.right },
      cards,
    }
  })
  const firstCardBox = await firstCard.boundingBox()

  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
  expect(firstCardBox).not.toBeNull()
  expect(firstCardBox!.width).toBeGreaterThanOrEqual(175)
  expect(
    dimensions.cards.some(
      (card) =>
        card.left < dimensions.bounds.right &&
        card.right > dimensions.bounds.right,
    ),
  ).toBe(true)
})

test('fits all five country regions on a small tablet landscape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.goto('/knowledge/countries')

  const mapSlot = page.locator('.knowledge-map-workbench-map')
  const mapCard = page.locator('.knowledge-map-card')
  const regionGrid = page.locator('.knowledge-category-grid')
  const cards = regionGrid.getByRole('link')
  await expect(cards).toHaveCount(5)

  const [mapSlotBox, mapBox, layout] = await Promise.all([
    mapSlot.boundingBox(),
    mapCard.boundingBox(),
    regionGrid.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const cardBounds = Array.from(element.querySelectorAll('a')).map((card) =>
        card.getBoundingClientRect(),
      )
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        allCardsVisible: cardBounds.every(
          (card) =>
            card.left >= bounds.left - 1 && card.right <= bounds.right + 1,
        ),
        widths: cardBounds.map((card) => card.width),
      }
    }),
  ])

  expect(mapSlotBox).not.toBeNull()
  expect(mapBox).not.toBeNull()
  expect(mapBox!.width).toBeCloseTo(mapSlotBox!.width, 0)
  expect(mapBox!.width / mapBox!.height).toBeCloseTo(36 / 17, 2)
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
  expect(layout.allCardsVisible).toBe(true)
  expect(
    Math.max(...layout.widths) - Math.min(...layout.widths),
  ).toBeLessThanOrEqual(1)
})

test('reveals a directly selected trailing continent tab', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 })
  await page.goto('/knowledge/countries?continent=oceania')

  const tablist = page.getByRole('tablist', { name: '大洲' })
  const activeTab = tablist.getByRole('tab', { name: /大洋洲/ })
  await expect(activeTab).toHaveAttribute('aria-selected', 'true')

  const visibility = await tablist.evaluate((element) => {
    const selected = element.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    )!
    const listBounds = element.getBoundingClientRect()
    const selectedBounds = selected.getBoundingClientRect()
    return {
      scrollLeft: element.scrollLeft,
      fullyVisible:
        selectedBounds.left >= listBounds.left - 1 &&
        selectedBounds.right <= listBounds.right + 1,
    }
  })

  expect(visibility.scrollLeft).toBeGreaterThan(0)
  expect(visibility.fullyVisible).toBe(true)
})
