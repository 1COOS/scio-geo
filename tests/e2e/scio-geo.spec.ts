import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

async function answerCurrentQuestion(page: Page) {
  await expect(page.locator('.knowledge-question-card')).toBeVisible()
  await expect(page.locator('.knowledge-question-feedback button')).toHaveCount(
    0,
  )
  const choice = page.locator('.knowledge-question-options button').first()
  if ((await choice.count()) > 0) {
    await choice.click()
    return
  }

  await page.locator('.knowledge-character-bank button').first().click()
  await page.getByRole('button', { name: '确认答案' }).click()
}

async function forceChoiceQuestionSequence(page: Page) {
  await page.addInitScript(() => {
    Math.random = () => 0.34
  })
}

async function openCountrySearch(page: Page) {
  const trigger = page
    .getByRole('navigation', { name: 'Scio Geo 主导航' })
    .getByRole('link', { name: '搜索', exact: true })
  await trigger.click()
  await expect(page).toHaveURL(/\/search$/)
  const search = page.getByRole('combobox', { name: '搜索地点' })
  await expect(search).toBeFocused()
  return search
}

async function openLayerControl(page: Page) {
  const control = page.getByRole('region', { name: '地球图层控制' })
  const trigger = control.getByRole('button', {
    name: /图层，已开启 \d+ 项/,
  })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click()
  }
  await expect(control.getByRole('region', { name: '图层选择' })).toBeVisible()
  return control
}

async function waitForKnowledgeCardSettled(card: Locator) {
  await expect
    .poll(() =>
      card.evaluate((element) =>
        element
          .getAnimations()
          .every((animation) => animation.playState === 'finished'),
      ),
    )
    .toBe(true)
}

async function expectFramedFlag(
  frame: Locator,
  expectedNaturalAspectRatio?: number,
) {
  await expect(frame).toBeVisible()
  await expect
    .poll(() =>
      frame.evaluate(
        (element) =>
          element.querySelector<HTMLImageElement>('img')?.naturalWidth ?? 0,
      ),
    )
    .toBeGreaterThan(0)
  const metrics = await frame.evaluate((element) => {
    const image = element.querySelector('img')
    if (!image) throw new Error('Flag frame is missing its image')
    const frameBox = element.getBoundingClientRect()
    const imageBox = image.getBoundingClientRect()
    const style = getComputedStyle(image)
    const ratioFallbackStyle = getComputedStyle(element, '::before')
    return {
      fallbackContent: ratioFallbackStyle.content,
      fallbackHeight: Number.parseFloat(ratioFallbackStyle.paddingTop),
      frameLayoutWidth: element.clientWidth,
      frameAspectRatio: frameBox.width / frameBox.height,
      frameHeight: frameBox.height,
      frameWidth: frameBox.width,
      imageAspectRatio: imageBox.width / imageBox.height,
      imageHeight: imageBox.height,
      imageWidth: imageBox.width,
      centerDeltaX: Math.abs(
        imageBox.x + imageBox.width / 2 - (frameBox.x + frameBox.width / 2),
      ),
      centerDeltaY: Math.abs(
        imageBox.y + imageBox.height / 2 - (frameBox.y + frameBox.height / 2),
      ),
      naturalAspectRatio: image.naturalWidth / image.naturalHeight,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderRightWidth: style.borderRightWidth,
      borderTopWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
    }
  })

  expect(metrics.fallbackContent).not.toBe('none')
  expect(
    Math.abs(metrics.fallbackHeight - metrics.frameLayoutWidth * (2 / 3)),
  ).toBeLessThan(1)
  expect(metrics.frameAspectRatio).toBeCloseTo(3 / 2, 2)
  expect(metrics.frameHeight).toBeGreaterThan(1)
  expect(metrics.imageAspectRatio).toBeCloseTo(metrics.naturalAspectRatio, 2)
  expect(metrics.imageWidth).toBeLessThanOrEqual(metrics.frameWidth + 0.5)
  expect(metrics.imageHeight).toBeLessThanOrEqual(metrics.frameHeight + 0.5)
  expect(
    Math.max(
      metrics.imageWidth / metrics.frameWidth,
      metrics.imageHeight / metrics.frameHeight,
    ),
  ).toBeGreaterThan(0.95)
  expect(metrics.centerDeltaX).toBeLessThanOrEqual(0.75)
  expect(metrics.centerDeltaY).toBeLessThanOrEqual(0.75)
  expect(metrics.borderBottomWidth).toBe('0px')
  expect(metrics.borderLeftWidth).toBe('0px')
  expect(metrics.borderRightWidth).toBe('0px')
  expect(metrics.borderTopWidth).toBe('0px')
  expect(metrics.boxShadow).not.toBe('none')
  expect(metrics.boxShadow).toContain('rgba(244, 248, 248, 0.76)')
  expect(metrics.boxShadow).toContain('rgba(0, 0, 0, 0.52)')
  expect(metrics.objectFit).toBe('contain')
  expect(metrics.objectPosition).toBe('50% 50%')
  if (expectedNaturalAspectRatio !== undefined) {
    expect(metrics.naturalAspectRatio).toBeCloseTo(
      expectedNaturalAspectRatio,
      2,
    )
  }
}

async function waitForSceneOrFallback(page: Page) {
  const scene = page.getByTestId('globe-scene')
  const fallback = page.getByTestId('webgl-fallback')
  await expect(scene.or(fallback)).toBeVisible({ timeout: 15_000 })
  return { scene, fallback }
}

async function installFullscreenApiMock(page: Page) {
  await page.addInitScript(() => {
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value() {
        fullscreenElement = document.documentElement
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      },
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value() {
        fullscreenElement = null
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      },
    })
  })
}

async function selectPlace(page: Page, query: string) {
  const search = await openCountrySearch(page)
  await search.fill(query)
  await search.press('Enter')
}

async function expectSelectedLinearFeatureRoute(
  page: Page,
  featureId: string,
  labelName: string,
) {
  const overlay = page.getByTestId('selected-linear-feature-overlay')
  const route = page.getByTestId('selected-linear-feature-route')
  const start = page.getByTestId('selected-linear-feature-start')
  const end = page.getByTestId('selected-linear-feature-end')
  const label = page.locator(
    `[data-linear-feature-id="${featureId}"].linear-feature-label`,
  )

  await expect(overlay).toHaveAttribute('data-linear-feature-id', featureId)
  await expect(overlay).toBeVisible()
  await expect(route).toHaveAttribute('d', /M[-\d.]+,[-\d.]+ L/)
  await expect(route).toHaveCSS('stroke-width', /^(8|9)px$/)
  await expect(start).toHaveAttribute('cx', /\d/)
  await expect(start).toHaveAttribute('cy', /\d/)
  await expect(end).toHaveAttribute('points', /\d/)
  await expect(label).toBeVisible()
  await expect(label).toHaveText(labelName)

  const [routeBox, labelBox] = await Promise.all([
    route.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }),
    label.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }),
  ])
  expect(Math.max(routeBox.width, routeBox.height)).toBeGreaterThan(0.5)
  const routeCenter = {
    x: routeBox.x + routeBox.width / 2,
    y: routeBox.y + routeBox.height / 2,
  }
  expect(
    routeCenter.x >= labelBox.x &&
      routeCenter.x <= labelBox.x + labelBox.width &&
      routeCenter.y >= labelBox.y &&
      routeCenter.y <= labelBox.y + labelBox.height,
  ).toBe(false)
}

async function expectSelectedMountainRoute(
  page: Page,
  rangeId: string,
  labelName: string,
) {
  const overlay = page.getByTestId('selected-mountain-overlay')
  const route = page.getByTestId('selected-mountain-route')
  const peak = page.getByTestId('selected-mountain-peak')
  const label = page.locator(`[data-map-label-id="${rangeId}"]`)

  await expect(overlay).toHaveAttribute('data-mountain-range-id', rangeId)
  await expect(overlay).toHaveAttribute('data-mountain-detail', 'high')
  await expect(overlay).toBeVisible()
  await expect(route).toHaveAttribute('d', /M[-\d.]+,[-\d.]+ L/)
  await expect(peak).toBeVisible()
  await expect(label).toBeVisible()
  await expect(label).toHaveText(labelName)
}

async function expectLayerPanelGrouped(page: Page) {
  const layerControl = await openLayerControl(page)
  const panel = layerControl.getByRole('region', { name: '图层选择' })
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText([
    '标注',
    '地球知识',
    '水域',
    '地貌与文化',
  ])
  await expect(panel.getByRole('button')).toHaveCount(10)
}

async function readMapHighlightStyle(page: Page, selector: string) {
  const target = page.locator(selector).first()
  await expect(target).toBeAttached({ timeout: 15_000 })
  return target.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      filter: style.filter,
    }
  })
}

test('loads the responsive Scio Geo exploration shell', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: '转动地球，发现每一片土地' }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Scio Geo 首页' })).toHaveCount(0)
  await expect(page.getByText('SCIO GEO · EARTH EXPLORATION LAB')).toHaveCount(
    0,
  )
  await expect(page.getByRole('link', { name: '搜索' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '搜索地点' })).toHaveCount(0)

  const { scene } = await waitForSceneOrFallback(page)

  if (await scene.isVisible()) {
    await expect(page.getByTestId('world-mini-map')).toBeVisible()
    await expect(
      page.locator(
        '.world-mini-map-landmasses [data-landmass-id="antarctica"]',
      ),
    ).toHaveCount(1)
    await expect(page.locator('[data-country-code="AQ"]')).toHaveCount(0)
    const layerControl = await openLayerControl(page)
    const cities = layerControl.getByRole('button', { name: '城市' })
    const rivers = layerControl.getByRole('button', {
      name: '河流图层：世界重要河流与人工运河',
    })
    const mountains = layerControl.getByRole('button', {
      name: '山脉图层：世界著名山脉与最高峰',
    })
    await expect(layerControl).toBeVisible()
    await expect(
      layerControl.getByRole('button', { name: '首都' }),
    ).toHaveCount(0)
    await expect(cities).toHaveAttribute('aria-pressed', 'false')
    await expect(rivers).toHaveAttribute('aria-pressed', 'false')
    await expect(
      layerControl.getByRole('button', { name: '运河图层：重要人工运河' }),
    ).toHaveCount(0)
    await expect(mountains).toHaveAttribute('aria-pressed', 'false')
    await expect(
      page.getByRole('navigation', { name: '地球显示控制' }),
    ).toBeVisible()
    await page.getByRole('button', { name: '自动旋转：开' }).click()
    await expect(
      page.getByRole('button', { name: '自动旋转：关' }),
    ).toBeVisible()
    await page.getByRole('button', { name: '重置视角' }).click()
  }
})

test('switches between exploration and knowledge without scene teardown errors', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')
  const { scene, fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return
  await expect(scene).toBeVisible()

  const knowledgeLink = page.getByRole('link', { name: '图鉴' })
  const exploreLink = page.getByRole('link', { name: '探索地球' })
  await knowledgeLink.click()
  await page.getByTestId('knowledge-home-module-countries').click()
  await expect(
    page.getByRole('heading', { name: '国家首都', level: 1 }),
  ).toHaveClass('sr-only')

  await exploreLink.click()
  await waitForSceneOrFallback(page)
  await expect(page.getByTestId('globe-scene')).toBeVisible()

  await knowledgeLink.click()
  await page.getByTestId('knowledge-home-module-countries').click()
  await expect(
    page.getByRole('heading', { name: '国家首都', level: 1 }),
  ).toHaveClass('sr-only')

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('navigates the country knowledge atlas and deep-links back to the globe', async ({
  page,
}) => {
  await page.goto('/knowledge/countries')

  await expect(
    page.getByRole('heading', { name: '国家首都', level: 1 }),
  ).toHaveClass('sr-only')
  await expect(page.getByTestId('knowledge-region-east-asia')).toContainText(
    '5 国',
  )
  await page.getByTestId('knowledge-region-east-asia').click()

  await expect(
    page.getByRole('heading', { name: '东亚', level: 1 }),
  ).toBeVisible()
  const knowledgeMap = page.locator('.knowledge-region-map')
  await expect(
    knowledgeMap.locator('[data-landmass-id="antarctica"]'),
  ).toHaveCount(0)
  await expect(knowledgeMap).toHaveAttribute('data-map-scope', 'region')
  await expect(knowledgeMap.locator('path.is-region')).toHaveCount(5)
  await expect(knowledgeMap.locator('path.is-continent')).toHaveCount(0)
  const chinaCard = page
    .getByRole('button', { name: '查看中国国家详情' })
    .locator('..')
  const displayControls = page.getByRole('group', {
    name: '国家卡显示内容',
  })
  await expect(
    displayControls.getByRole('button', { name: '国旗' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(chinaCard.getByText('中国', { exact: true })).toHaveCount(0)
  await displayControls.getByRole('button', { name: '国家' }).click()
  await displayControls.getByRole('button', { name: '首都' }).click()
  await expect(chinaCard).toContainText('中国')
  await expect(chinaCard).toContainText('北京')

  await page.getByRole('button', { name: '查看中国国家详情' }).click()
  await expect(knowledgeMap.locator('path.is-country')).toHaveCount(1)
  await expect(
    knowledgeMap.locator('path[data-country-code="CN"].is-country'),
  ).toHaveCount(1)
  await expect(knowledgeMap.locator('path.is-region')).toHaveCount(4)
  const detail = page.getByLabel('中国国家学习详情')
  await expect(detail).toBeVisible()
  await detail.getByRole('link', { name: /在3D地球上查看/ }).click()
  await expect(page).toHaveURL(/\/explore\?country=CN$/)
  await waitForSceneOrFallback(page)
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900, touch: false },
  { name: 'phone landscape', width: 844, height: 390, touch: true },
  { name: 'iPad landscape', width: 1194, height: 834, touch: true },
]) {
  test(`keeps native flag proportions inside 3:2 slots on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })

    for (const flagCase of [
      {
        route: '/knowledge/countries/west-europe',
        alt: '德国国旗',
        naturalAspectRatio: 5 / 3,
      },
      {
        route: '/knowledge/countries/west-europe',
        alt: '瑞士国旗',
        naturalAspectRatio: 1,
      },
      {
        route: '/knowledge/countries/west-asia',
        alt: '卡塔尔国旗',
        naturalAspectRatio: 28 / 11,
      },
      {
        route: '/knowledge/countries/south-asia',
        alt: '尼泊尔国旗',
        naturalAspectRatio: 71.571 / 87.246,
      },
    ]) {
      await page.goto(flagCase.route)
      await expectFramedFlag(
        page.getByAltText(flagCase.alt).locator('..'),
        flagCase.naturalAspectRatio,
      )
    }
  })
}

test('resets scroll and keeps the result card visible on phone landscape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await forceChoiceQuestionSequence(page)
  await page.goto('/questions/asia/easy')

  for (let index = 0; index < 10; index += 1) {
    await answerCurrentQuestion(page)
    if (index === 9) {
      await page
        .locator('.knowledge-challenge-shell')
        .evaluate((shell) => (shell.scrollTop = 100))
    }
    await page
      .getByRole('button', {
        name: index === 9 ? '查看成绩' : '下一题',
      })
      .click()
  }

  const geometry = await page
    .locator('.knowledge-challenge-result')
    .evaluate((result) => {
      const rect = result.getBoundingClientRect()
      const shell = result.closest('.knowledge-challenge-shell')!
      return {
        top: rect.top,
        bottom: rect.bottom,
        scrollTop: shell.scrollTop,
        viewportHeight: document.documentElement.clientHeight,
      }
    })
  expect(geometry.scrollTop).toBe(0)
  expect(geometry.top).toBeGreaterThanOrEqual(0)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900, touch: false },
  { name: 'iPad landscape', width: 1194, height: 834, touch: true },
  { name: 'phone landscape', width: 844, height: 390, touch: true },
]) {
  test(`keeps earth learning interactive on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize(viewport)

    await page.goto('/knowledge/countries/east-asia?country=CN')
    const countryDetailMap = page.locator('.knowledge-region-map-strip')
    const countryDetailBrowser = page.locator('.knowledge-region-browser')
    const countryDetailCard = page.getByLabel('中国国家学习详情')
    await expect(countryDetailMap).toBeVisible()
    await expect(countryDetailCard).toBeVisible()
    await waitForKnowledgeCardSettled(countryDetailCard)
    const [countryDetailMapBox, countryDetailBrowserBox, countryDetailCardBox] =
      await Promise.all([
        countryDetailMap.boundingBox(),
        countryDetailBrowser.boundingBox(),
        countryDetailCard.boundingBox(),
      ])

    await page.goto('/knowledge/countries')
    const countryMapCard = page.locator('.knowledge-map-card')
    await expect(
      countryMapCard.locator('.knowledge-region-map-countries path').first(),
    ).toBeVisible()
    const countryMapBox = await countryMapCard.boundingBox()

    await page.goto('/knowledge/earth?topic=hemispheres')

    await expect(
      page.getByRole('heading', { name: '地球经纬', level: 1 }),
    ).toHaveClass('sr-only')
    await expect(page.locator('.knowledge-topic-card')).toHaveCount(0)
    await expect(
      page.getByRole('tab', { name: '半球界线', exact: true }),
    ).toHaveAttribute('aria-selected', 'true')
    const referenceLines = page.getByLabel('重点经纬线')
    await expect(referenceLines.getByRole('link')).toHaveCount(3)
    await expect(
      referenceLines.getByRole('link', { name: /赤道\s*0°/ }),
    ).toHaveAttribute('href', '/knowledge/earth/lines/equator')
    await expect(page.getByText('当前定位')).toHaveCount(0)
    await expect(page.getByLabel('当前位置判读')).toHaveCount(0)
    await expect(page.locator('.knowledge-earth-map-marker')).toHaveCount(0)
    const map = page.getByTestId('knowledge-earth-map')
    await expect(map).toBeVisible()
    await expect(
      map.locator('.knowledge-earth-map-reference-lines > .is-topic-line'),
    ).toHaveCount(3)
    await expect(
      map.locator('.knowledge-earth-map-reference-lines > .is-background-line'),
    ).toHaveCount(10)
    await expect(map.locator('.knowledge-earth-reference-label')).toHaveCount(3)
    const coverageRegions = map.locator('[data-coverage-region-id]')
    await expect(coverageRegions).toHaveCount(2)
    await expect(
      map.locator(
        '[data-coverage-region-id="western-hemisphere"] .knowledge-earth-coverage-area',
      ),
    ).toHaveCount(2)
    await expect(map.locator('.knowledge-earth-coverage-label')).toHaveCount(2)

    const coverageColorContract = await coverageRegions.evaluateAll((regions) =>
      regions.every((region) => {
        const area = region.querySelector('.knowledge-earth-coverage-area')
        const label = region.querySelector('.knowledge-earth-coverage-label')
        if (!area || !label) return false
        return (
          getComputedStyle(area).fill === getComputedStyle(label).fill &&
          getComputedStyle(area).fillOpacity === '0.12'
        )
      }),
    )
    expect(coverageColorContract).toBe(true)

    const lineWidths = await map
      .locator('.knowledge-earth-reference-visible')
      .evaluateAll((lines) =>
        Array.from(
          new Set(lines.map((line) => line.getAttribute('stroke-width'))),
        ).sort(),
      )
    expect(lineWidths).toEqual(['0.8', '1.8'])

    const currentTopicLine = map.locator('[data-reference-line-id="equator"]')
    await currentTopicLine.focus()
    await expect(currentTopicLine).toHaveCSS('outline-style', 'none')
    await expect(
      currentTopicLine.locator('.knowledge-earth-reference-visible'),
    ).toHaveCSS('stroke-width', '1.8px')

    const homepageColors = await Promise.all([
      map
        .locator('[data-reference-line-id="equator"]')
        .evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue('--knowledge-earth-line-color')
            .trim(),
        ),
      referenceLines
        .getByRole('link', { name: /赤道\s*0°/ })
        .evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue('--knowledge-earth-line-color')
            .trim(),
        ),
    ])
    expect(homepageColors).toEqual(['#62d9ff', '#62d9ff'])

    await map
      .locator('[data-reference-line-id="tropic-of-cancer"]')
      .press('Enter')
    await expect(
      page.getByRole('tab', { name: '五带界线', exact: true }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\/knowledge\/earth\?topic=earth-zones$/)
    await expect(referenceLines.getByRole('link')).toHaveCount(4)
    await expect(map.locator('.knowledge-earth-reference-label')).toHaveCount(4)
    await expect(coverageRegions).toHaveCount(5)

    const geometry = await page.evaluate(() => {
      const mapCard = document
        .querySelector('.knowledge-earth-map-card')!
        .getBoundingClientRect()
      const map = document
        .querySelector('.knowledge-earth-map')!
        .getBoundingClientRect()
      const lineButtons = Array.from(
        document.querySelectorAll('.knowledge-earth-reference-grid a'),
      ).map((button) => button.getBoundingClientRect())
      const labels = Array.from(
        document.querySelectorAll(
          '.knowledge-earth-reference-label, .knowledge-earth-coverage-label',
        ),
      ).map((label) => label.getBoundingClientRect())
      const tablist = document.querySelector('.knowledge-primary-tabs')!
      const tab = tablist.querySelector('button')!
      return {
        mapCard: {
          x: mapCard.x,
          y: mapCard.y,
          width: mapCard.width,
          height: mapCard.height,
        },
        map: { x: map.x, y: map.y, width: map.width, height: map.height },
        minLineButtonHeight: Math.min(
          ...lineButtons.map((button) => button.height),
        ),
        firstRowLineCount: lineButtons.filter(
          (button) => Math.abs(button.y - lineButtons[0].y) < 1,
        ).length,
        labelsInsideMap: labels.every(
          (label) =>
            label.x >= mapCard.x &&
            label.y >= mapCard.y &&
            label.right <= mapCard.right &&
            label.bottom <= mapCard.bottom,
        ),
        tablistBorderBottomWidth: getComputedStyle(tablist).borderBottomWidth,
        tabDisplay: getComputedStyle(tab).display,
        tabFontSize: getComputedStyle(tab.querySelector('strong')!).fontSize,
        pageOverflows:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      }
    })
    expect(countryMapBox).not.toBeNull()
    expect(geometry.mapCard.width).toBeCloseTo(countryMapBox!.width, 0)
    expect(geometry.mapCard.width / geometry.mapCard.height).toBeCloseTo(
      720 / 340,
      2,
    )
    expect(geometry.map.x).toBeCloseTo(geometry.mapCard.x + 1, 0)
    expect(geometry.map.y).toBeCloseTo(geometry.mapCard.y + 1, 0)
    expect(geometry.map.width).toBeCloseTo(geometry.mapCard.width - 2, 0)
    expect(geometry.map.height).toBeCloseTo(geometry.mapCard.height - 2, 0)
    expect(geometry.minLineButtonHeight).toBeGreaterThanOrEqual(
      viewport.height <= 600 ? 56 : 64,
    )
    expect(geometry.firstRowLineCount).toBe(4)
    expect(geometry.labelsInsideMap).toBe(true)
    expect(geometry.tablistBorderBottomWidth).toBe('0px')
    expect(geometry.tabDisplay).toBe('flex')
    expect(geometry.tabFontSize).toBe('15px')
    expect(geometry.pageOverflows).toBe(false)

    await referenceLines.getByRole('link', { name: '北回归线 23.5°N' }).click()
    await expect(page).toHaveURL(/\/knowledge\/earth\/lines\/tropic-of-cancer$/)
    const earthDetailMap = page.locator('.knowledge-earth-map-card')
    const earthDetailCard = page.getByRole('complementary', {
      name: '北回归线经纬线详情',
    })
    const siblingLines = page.getByLabel('五带分界线同组经纬线')
    await expect(earthDetailMap).toBeVisible()
    await expect(earthDetailCard).toBeVisible()
    await waitForKnowledgeCardSettled(earthDetailCard)
    await expect(page.getByLabel('知识主题')).toHaveCount(0)
    await expect(page.getByText('资料来源')).toHaveCount(0)
    await expect(
      earthDetailCard.getByRole('link', { name: /在3D地球上查看/ }),
    ).toHaveAttribute(
      'href',
      '/explore?geography=earth-zones&line=tropic-of-cancer',
    )
    await expect(page.getByRole('link', { name: '← 返回五带界线' })).toHaveCSS(
      'font-weight',
      '400',
    )
    await expect(siblingLines.getByRole('link')).toHaveCount(4)
    await expect(
      earthDetailMap.locator('[data-coverage-region-id]'),
    ).toHaveCount(5)
    await expect(earthDetailMap.locator('.is-selected')).toHaveCount(0)
    expect(
      await earthDetailMap
        .locator('.is-topic-line .knowledge-earth-reference-visible')
        .evaluateAll((lines) =>
          Array.from(
            new Set(lines.map((line) => line.getAttribute('stroke-width'))),
          ),
        ),
    ).toEqual(['1.8'])
    await expect(
      siblingLines.getByRole('link', { name: '北回归线 23.5°N' }),
    ).toHaveAttribute('aria-current', 'page')

    const [earthDetailMapBox, earthDetailCardBox, detailLayoutBefore] =
      await Promise.all([
        earthDetailMap.boundingBox(),
        earthDetailCard.boundingBox(),
        page.evaluate(() => {
          const buttons = Array.from(
            document.querySelectorAll('.knowledge-earth-reference-grid a'),
          ).map((button) => button.getBoundingClientRect())
          return {
            firstRowLineCount: buttons.filter(
              (button) => Math.abs(button.y - buttons[0].y) < 1,
            ).length,
            pageOverflows:
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth,
          }
        }),
      ])
    expect(countryDetailMapBox).not.toBeNull()
    expect(countryDetailBrowserBox).not.toBeNull()
    expect(countryDetailCardBox).not.toBeNull()
    expect(earthDetailMapBox).not.toBeNull()
    expect(earthDetailCardBox).not.toBeNull()
    expect(countryDetailMapBox!.width).toBeLessThan(
      countryDetailBrowserBox!.width,
    )
    expect(earthDetailMapBox!.width).toBeCloseTo(
      countryDetailBrowserBox!.width,
      0,
    )
    expect(earthDetailMapBox!.width / earthDetailMapBox!.height).toBeCloseTo(
      720 / 340,
      2,
    )
    expect(earthDetailCardBox!.width).toBeCloseTo(
      countryDetailCardBox!.width,
      0,
    )
    expect(detailLayoutBefore.firstRowLineCount).toBe(4)
    expect(detailLayoutBefore.pageOverflows).toBe(false)

    await siblingLines.getByRole('link', { name: '南极圈 66.5°S' }).click()
    await expect(page).toHaveURL(/\/knowledge\/earth\/lines\/antarctic-circle$/)
    await expect(
      page.getByRole('complementary', { name: '南极圈经纬线详情' }),
    ).toBeVisible()
    const [earthDetailMapAfter, earthDetailCardAfter] = await Promise.all([
      earthDetailMap.boundingBox(),
      page
        .getByRole('complementary', { name: '南极圈经纬线详情' })
        .boundingBox(),
    ])
    expect(earthDetailMapAfter!.width).toBeCloseTo(earthDetailMapBox!.width, 0)
    expect(earthDetailCardAfter!.width).toBeCloseTo(
      earthDetailCardBox!.width,
      0,
    )
  })
}

test('redirects legacy earth-line URLs and rejects unknown line details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/knowledge/earth?topic=earth-zones&line=tropic-of-cancer')
  await expect(page).toHaveURL(/\/knowledge\/earth\/lines\/tropic-of-cancer$/)
  await expect(
    page.getByRole('complementary', { name: '北回归线经纬线详情' }),
  ).toBeVisible()
  await expect(page.getByText('资料来源')).toHaveCount(0)
  await expect(
    page.locator(
      '.knowledge-earth-map-reference-lines [data-reference-line-id="tropic-of-cancer"]',
    ),
  ).toHaveClass(/is-topic-line/)
  await expect(
    page.locator('.knowledge-earth-map-reference-lines .is-selected'),
  ).toHaveCount(0)

  await page.goto('/knowledge/earth/lines/unknown')
  await expect(page).toHaveURL(/\/knowledge\/earth$/)
  await expect(
    page.getByRole('tab', { name: '经度基准', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
})

test('uses the contained flag contract across learning and exploration surfaces', async ({
  page,
}) => {
  await page.goto('/knowledge/countries/east-asia')
  await expectFramedFlag(page.getByAltText('中国国旗').locator('..'))

  await page.getByRole('button', { name: '查看中国国家详情' }).click()
  await expectFramedFlag(
    page.locator('.country-knowledge-card .knowledge-country-detail-flag'),
  )
  await page
    .locator('.country-knowledge-card')
    .getByRole('button', { name: /国际关系/ })
    .click()
  await expectFramedFlag(
    page
      .locator(
        '.country-knowledge-card .knowledge-country-chapter.is-international-relations',
      )
      .locator('.country-flag-frame')
      .first(),
  )

  await page.addInitScript(() => {
    Math.random = () => 0
  })
  await page.goto('/questions/asia/easy')
  await expectFramedFlag(page.locator('.knowledge-question-flag'))

  await page.goto('/explore?country=CH')
  await waitForSceneOrFallback(page)
  await expectFramedFlag(page.locator('.knowledge-country-detail-flag'))
  await page
    .locator('.country-knowledge-card')
    .getByRole('button', { name: /国际关系/ })
    .click()
  await expectFramedFlag(
    page
      .locator(
        '.knowledge-country-chapter.is-international-relations .country-flag-frame',
      )
      .first(),
  )

  const search = await openCountrySearch(page)
  await search.fill('卡塔尔')
  await expectFramedFlag(
    page.locator('.country-search-popover .country-flag-frame').first(),
    28 / 11,
  )

  await search.fill('撒哈拉沙漠')
  await search.press('Enter')
  const desertCard = page.getByRole('complementary', {
    name: '撒哈拉沙漠知识卡',
  })
  await expect(desertCard).toBeVisible()
  await expectFramedFlag(
    desertCard.locator('.country-border-list .country-flag-frame').first(),
  )
})

test('opens a responsive flag dialog without resizing the country card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/knowledge/countries/east-asia?country=CN')

  const card = page.getByLabel('中国国家学习详情')
  const flagTrigger = card.getByRole('button', { name: '查看中国国旗含义' })
  const flagFrame = flagTrigger.locator('.knowledge-country-detail-flag')
  const flagCue = flagTrigger.locator('.country-flag-meaning-cue')
  await waitForKnowledgeCardSettled(card)
  const [cardBoxBefore, flagFrameBox, flagCueBox, flagCueIconBox] =
    await Promise.all([
      card.boundingBox(),
      flagFrame.boundingBox(),
      flagCue.boundingBox(),
      flagCue.locator('svg').boundingBox(),
    ])
  expect(cardBoxBefore).not.toBeNull()
  expect(flagFrameBox).not.toBeNull()
  expect(flagCueBox).not.toBeNull()
  expect(flagCueIconBox).not.toBeNull()
  expect(flagCueBox!.x).toBeCloseTo(flagFrameBox!.x, 0)
  expect(flagCueIconBox!.width).toBeGreaterThanOrEqual(17)
  expect(flagCueIconBox!.height).toBeGreaterThanOrEqual(17)
  await expect(flagTrigger).toHaveAttribute('aria-expanded', 'false')
  await flagTrigger.click()

  await expect(flagTrigger).toHaveAttribute('aria-expanded', 'true')
  let dialog = page.getByRole('dialog', { name: '中国国旗' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByAltText('中国国旗')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: '外观' })).toBeVisible()
  await expect(
    dialog.getByRole('heading', { name: '含义', exact: true }),
  ).toBeVisible()
  await expect(dialog.getByRole('heading', { name: '历史' })).toHaveCount(0)
  await expect(
    dialog.getByText(/四个社会阶级.*城市小资产阶级.*民族资产阶级/),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: '关闭中国国旗含义' }),
  ).toBeFocused()
  const cardBoxDuring = await card.boundingBox()
  expect(cardBoxDuring).not.toBeNull()
  expect(cardBoxDuring!.width).toBeCloseTo(cardBoxBefore!.width, 0)
  expect(cardBoxDuring!.height).toBeCloseTo(cardBoxBefore!.height, 0)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(flagTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(flagTrigger).toBeFocused()

  await page.setViewportSize({ width: 844, height: 390 })
  await flagTrigger.click()
  dialog = page.getByRole('dialog', { name: '中国国旗' })
  await expect(dialog).toBeVisible()
  const [triggerBox, dialogBox, closeBox, horizontalOverflow] =
    await Promise.all([
      flagTrigger.boundingBox(),
      dialog.boundingBox(),
      dialog.getByRole('button', { name: '关闭中国国旗含义' }).boundingBox(),
      dialog
        .locator('.country-flag-dialog-body')
        .evaluate((element) =>
          Math.max(0, element.scrollWidth - element.clientWidth),
        ),
    ])
  expect(triggerBox).not.toBeNull()
  expect(dialogBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  expect(triggerBox!.width).toBeGreaterThanOrEqual(44)
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44)
  expect(closeBox!.width).toBeGreaterThanOrEqual(44)
  expect(closeBox!.height).toBeGreaterThanOrEqual(44)
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(845)
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(391)
  expect(horizontalOverflow).toBeLessThanOrEqual(1)
  await page.mouse.click(1, 1)
  await expect(dialog).toBeHidden()
  await expect(flagTrigger).toBeFocused()

  await page.goto('/knowledge/countries/east-asia?country=JP')
  const japanCard = page.getByLabel('日本国家学习详情')
  await japanCard.getByRole('button', { name: '查看日本国旗含义' }).click()
  const japanDialog = page.getByRole('dialog', { name: '日本国旗' })
  await expect(japanDialog.getByRole('heading', { name: '外观' })).toBeVisible()
  await expect(
    japanDialog.getByRole('heading', { name: '含义', exact: true }),
  ).toHaveCount(0)
  await expect(japanDialog.getByRole('heading', { name: '历史' })).toBeVisible()
  await expect(japanDialog.getByText(/至少从 1184 年起/)).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/knowledge/countries/west-asia?country=PS')
  const palestineCard = page.getByLabel('巴勒斯坦国家学习详情')
  await expect(
    palestineCard.getByRole('button', { name: '查看巴勒斯坦国旗含义' }),
  ).toHaveCount(0)
  await expect(palestineCard.getByAltText('巴勒斯坦国旗')).toBeVisible()
})

test('opens a responsive organization dialog with static member countries', async ({
  page,
}) => {
  for (const viewport of [
    { width: 568, height: 320 },
    { width: 844, height: 390 },
    { width: 956, height: 440 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/explore?country=AU')
    await waitForSceneOrFallback(page)

    const card = page.getByLabel('澳大利亚国家知识卡')
    await card.getByRole('button', { name: /国际关系/ }).click()
    const commonwealthTrigger = card.getByRole('button', {
      name: '查看英联邦详情',
    })
    await expect(commonwealthTrigger).toBeVisible()
    await expect(card.getByText('Commonwealth of Nations')).toHaveCount(0)
    expect(
      await commonwealthTrigger.evaluate((element) =>
        Math.max(0, element.scrollWidth - element.clientWidth),
      ),
    ).toBeLessThanOrEqual(1)

    await commonwealthTrigger.click()
    const dialog = page.getByRole('dialog', { name: '英联邦' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.locator('.international-affiliation-member-grid li'),
    ).toHaveCount(56)
    await expect(
      dialog.locator('.international-affiliation-member-grid button'),
    ).toHaveCount(0)
    const [dialogBox, closeBox, horizontalOverflow] = await Promise.all([
      dialog.boundingBox(),
      dialog.getByRole('button', { name: '关闭英联邦详情' }).boundingBox(),
      dialog
        .locator('.international-affiliation-dialog-body')
        .evaluate((element) =>
          Math.max(0, element.scrollWidth - element.clientWidth),
        ),
    ])
    expect(dialogBox).not.toBeNull()
    expect(closeBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )
    expect(closeBox!.width).toBeGreaterThanOrEqual(44)
    expect(closeBox!.height).toBeGreaterThanOrEqual(44)
    expect(horizontalOverflow).toBeLessThanOrEqual(1)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(commonwealthTrigger).toBeFocused()
    await expect(
      card.getByRole('button', { name: /国际关系/ }),
    ).toHaveAttribute('aria-expanded', 'true')
  }
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900, touch: false },
  { name: 'iPad landscape', width: 1194, height: 834, touch: true },
  {
    name: 'wide phone landscape',
    width: 956,
    height: 440,
    touch: true,
    safeArea: 59,
  },
  { name: 'phone landscape', width: 844, height: 390, touch: true },
  { name: 'smallest landscape', width: 568, height: 320, touch: true },
  { name: 'small landscape', width: 667, height: 375, touch: true },
]) {
  test(`keeps country knowledge cards identical on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize(viewport)
    const safeArea = viewport.safeArea ?? 0
    await page.goto('/knowledge/countries/east-asia')
    if ('safeArea' in viewport) {
      await page.evaluate((safeArea) => {
        document.documentElement.style.setProperty(
          '--atlas-safe-area-left',
          `${safeArea}px`,
        )
        document.documentElement.style.setProperty(
          '--atlas-safe-area-right',
          `${safeArea}px`,
        )
      }, viewport.safeArea)
    }
    await page.getByRole('button', { name: '查看中国国家详情' }).click()

    const knowledgeCard = page.getByRole('complementary', {
      name: '中国国家学习详情',
    })
    await waitForKnowledgeCardSettled(knowledgeCard)
    const knowledgeBox = await knowledgeCard.boundingBox()
    const knowledgeLayout = await knowledgeCard.evaluate((element) => {
      const content = element.querySelector<HTMLElement>(
        '.knowledge-card-content',
      )!
      return {
        documentOverflows:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
        contentClientHeight: content.clientHeight,
        contentScrollHeight: content.scrollHeight,
      }
    })
    expect(knowledgeBox).not.toBeNull()
    expect(knowledgeBox!.x).toBeGreaterThanOrEqual(0)
    expect(knowledgeBox!.y).toBeGreaterThanOrEqual(0)
    expect(knowledgeBox!.x + knowledgeBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    expect(knowledgeBox!.y + knowledgeBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )
    expect(knowledgeLayout.documentOverflows).toBe(false)
    expect(knowledgeLayout.contentScrollHeight).toBeGreaterThanOrEqual(
      knowledgeLayout.contentClientHeight,
    )
    const knowledgeContent = await knowledgeCard
      .locator('.knowledge-card-content')
      .innerText()
    const typography = await knowledgeCard.evaluate((element) => {
      const fontSize = (selector: string) => {
        const target = element.querySelector(selector)
        if (!target) throw new Error(`Missing typography target: ${selector}`)
        return Number.parseFloat(getComputedStyle(target).fontSize)
      }

      return {
        body: fontSize('.knowledge-country-chapter-trigger'),
        code: fontSize('.knowledge-country-summary-copy > p > span:last-child'),
        englishName: fontSize(
          '.knowledge-country-summary-copy > p > span:first-child',
        ),
        factLabel: fontSize('.knowledge-country-facts dt'),
        factValue: fontSize('.knowledge-country-facts dd'),
        officialName: fontSize('.knowledge-country-summary-copy small'),
      }
    })
    expect(typography.officialName).toBeGreaterThanOrEqual(12)
    expect(typography.englishName).toBe(typography.code)
    expect(typography.factLabel).toBeGreaterThanOrEqual(12)
    expect(typography.factValue).toBeGreaterThanOrEqual(13)
    expect(typography.body).toBeGreaterThanOrEqual(12)
    await expect(knowledgeCard.getByText('次区域')).toHaveCount(0)
    await expect(knowledgeCard.getByText('Eastern Asia')).toHaveCount(0)
    await expect(
      knowledgeCard.locator('.knowledge-country-facts > div > dt'),
    ).toHaveText(['人口', '面积', '首都', '法币'])
    await expect(
      knowledgeCard.getByText('14.1亿人', { exact: true }),
    ).toBeVisible()
    await expect(
      knowledgeCard.getByText('人民币 CNY ¥', { exact: true }),
    ).toBeVisible()
    await expect(
      knowledgeCard.getByText('Chinese yuan', { exact: true }),
    ).toBeVisible()
    await expect(knowledgeCard.getByText('2025 年')).toHaveCount(0)
    const [
      contentBox,
      headingBox,
      factsBox,
      areaBox,
      populationBox,
      capitalBox,
      currencyBox,
      actionBox,
    ] = await Promise.all([
      knowledgeCard.locator('.knowledge-card-content').boundingBox(),
      knowledgeCard.locator('.knowledge-country-summary-heading').boundingBox(),
      knowledgeCard.locator('.knowledge-country-facts').boundingBox(),
      knowledgeCard.locator('.knowledge-country-fact.is-area').boundingBox(),
      knowledgeCard
        .locator('.knowledge-country-fact.is-population')
        .boundingBox(),
      knowledgeCard.locator('.knowledge-country-fact.is-capital').boundingBox(),
      knowledgeCard
        .locator('.knowledge-country-fact.is-currency')
        .boundingBox(),
      knowledgeCard.getByRole('link', { name: /在3D地球上查看/ }).boundingBox(),
    ])
    expect(contentBox).not.toBeNull()
    expect(headingBox).not.toBeNull()
    expect(factsBox).not.toBeNull()
    expect(areaBox).not.toBeNull()
    expect(populationBox).not.toBeNull()
    expect(capitalBox).not.toBeNull()
    expect(currencyBox).not.toBeNull()
    expect(actionBox).not.toBeNull()
    expect(headingBox!.height).toBeLessThanOrEqual(125)
    expect(populationBox!.x).toBeLessThan(areaBox!.x)
    expect(areaBox!.y).toBeCloseTo(populationBox!.y, 0)
    expect(capitalBox!.x).toBeLessThan(currencyBox!.x)
    expect(capitalBox!.y).toBeCloseTo(currencyBox!.y, 0)
    expect(areaBox!.width / populationBox!.width).toBeCloseTo(1.5, 1)
    expect(currencyBox!.width / capitalBox!.width).toBeCloseTo(1.5, 1)
    expect(
      await knowledgeCard
        .locator('.knowledge-country-fact')
        .evaluateAll((facts) =>
          facts.map((fact) => getComputedStyle(fact).borderRightWidth),
        ),
    ).toEqual(['0px', '0px', '0px', '0px'])
    expect(
      await knowledgeCard
        .locator('.knowledge-country-fact')
        .evaluateAll((facts) =>
          facts.map((fact) => getComputedStyle(fact).borderBottomWidth),
        ),
    ).toEqual(['1px', '1px', '0px', '0px'])
    expect(currencyBox!.y + currencyBox!.height).toBeLessThanOrEqual(
      contentBox!.y + contentBox!.height + 1,
    )
    if (viewport.width === 844) {
      expect(knowledgeLayout.contentScrollHeight).toBeLessThanOrEqual(950)
    }
    await expect(
      knowledgeCard.getByText('大熊猫', { exact: true }),
    ).toBeVisible()
    await expect(
      knowledgeCard.getByRole('button', { name: /语言民族/ }),
    ).toHaveAttribute('aria-expanded', 'false')
    const flagMeaningTrigger = knowledgeCard.getByRole('button', {
      name: '查看中国国旗含义',
    })
    const flagMeaningTriggerBox = await flagMeaningTrigger.boundingBox()
    expect(flagMeaningTriggerBox).not.toBeNull()
    expect(flagMeaningTriggerBox!.width).toBeGreaterThanOrEqual(44)
    expect(flagMeaningTriggerBox!.height).toBeGreaterThanOrEqual(44)
    await flagMeaningTrigger.click()
    const flagDialog = page.getByRole('dialog', { name: '中国国旗' })
    await expect(flagDialog).toBeVisible()
    await expect(
      flagDialog.getByRole('heading', { name: '外观' }),
    ).toBeVisible()
    await expect(
      flagDialog.getByRole('heading', { name: '含义', exact: true }),
    ).toBeVisible()
    const [
      flagDialogBox,
      flagDialogCloseBox,
      cardBoxWhileOpen,
      dialogOverflow,
    ] = await Promise.all([
      flagDialog.boundingBox(),
      flagDialog
        .getByRole('button', { name: '关闭中国国旗含义' })
        .boundingBox(),
      knowledgeCard.boundingBox(),
      flagDialog
        .locator('.country-flag-dialog-body')
        .evaluate((element) =>
          Math.max(0, element.scrollWidth - element.clientWidth),
        ),
    ])
    expect(flagDialogBox).not.toBeNull()
    expect(flagDialogCloseBox).not.toBeNull()
    expect(cardBoxWhileOpen).not.toBeNull()
    expect(flagDialogBox!.x).toBeGreaterThanOrEqual(Math.max(0, safeArea - 1))
    expect(flagDialogBox!.x + flagDialogBox!.width).toBeLessThanOrEqual(
      viewport.width - safeArea + 1,
    )
    expect(flagDialogBox!.y).toBeGreaterThanOrEqual(0)
    expect(flagDialogBox!.y + flagDialogBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )
    expect(flagDialogCloseBox!.width).toBeGreaterThanOrEqual(44)
    expect(flagDialogCloseBox!.height).toBeGreaterThanOrEqual(44)
    expect(cardBoxWhileOpen!.width).toBeCloseTo(knowledgeBox!.width, 0)
    expect(cardBoxWhileOpen!.height).toBeCloseTo(knowledgeBox!.height, 0)
    expect(dialogOverflow).toBeLessThanOrEqual(1)
    await flagDialog.getByRole('button', { name: '关闭中国国旗含义' }).click()
    await expect(flagDialog).toBeHidden()
    await expect(flagMeaningTrigger).toBeFocused()
    const expandedHorizontalOverflow = await knowledgeCard
      .locator('.knowledge-card-content')
      .evaluate((element) =>
        Math.max(0, element.scrollWidth - element.clientWidth),
      )
    expect(expandedHorizontalOverflow).toBeLessThanOrEqual(1)
    const peopleTrigger = knowledgeCard.getByRole('button', {
      name: /语言民族/,
    })
    const chapterIcon = peopleTrigger.locator('.knowledge-country-chapter-icon')
    const chapterCopy = peopleTrigger.locator('.knowledge-country-chapter-copy')
    const chapterTitle = chapterCopy.locator('strong')
    const chapterSummary = chapterCopy.locator('small')
    const chapterDisclosure = peopleTrigger.locator(
      '.knowledge-country-chapter-disclosure',
    )
    const capitalIcon = knowledgeCard.locator(
      '.knowledge-country-fact.is-capital dt',
    )
    const capitalValue = knowledgeCard.locator(
      '.knowledge-country-fact.is-capital dd',
    )
    const [
      triggerBox,
      chapterIconBox,
      chapterCopyBox,
      chapterTitleBox,
      chapterSummaryBox,
      collapsedDisclosureBox,
      capitalIconBox,
      capitalValueBox,
    ] = await Promise.all([
      peopleTrigger.boundingBox(),
      chapterIcon.boundingBox(),
      chapterCopy.boundingBox(),
      chapterTitle.boundingBox(),
      chapterSummary.boundingBox(),
      chapterDisclosure.boundingBox(),
      capitalIcon.boundingBox(),
      capitalValue.boundingBox(),
    ])
    expect(triggerBox).not.toBeNull()
    expect(chapterIconBox).not.toBeNull()
    expect(chapterCopyBox).not.toBeNull()
    expect(chapterTitleBox).not.toBeNull()
    expect(chapterSummaryBox).not.toBeNull()
    expect(chapterTitleBox!.width).toBeGreaterThanOrEqual(68)
    expect(
      await chapterTitle.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBe(13)
    expect(
      await chapterSummary.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBe(13)
    expect(collapsedDisclosureBox).not.toBeNull()
    expect(capitalIconBox).not.toBeNull()
    expect(capitalValueBox).not.toBeNull()
    expect(Math.abs(chapterIconBox!.x - capitalIconBox!.x)).toBeLessThanOrEqual(
      1,
    )
    const chapterGap =
      chapterCopyBox!.x - (chapterIconBox!.x + chapterIconBox!.width)
    const capitalGap =
      capitalValueBox!.x - (capitalIconBox!.x + capitalIconBox!.width)
    expect(Math.abs(chapterGap - capitalGap)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        chapterTitleBox!.y +
          chapterTitleBox!.height / 2 -
          (chapterSummaryBox!.y + chapterSummaryBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(2)
    await expect(chapterTitle).toHaveText('语言民族')
    await expect(chapterSummary).toHaveText('中文 · 汉族')
    const leftInset = chapterIconBox!.x - triggerBox!.x
    const rightInset =
      triggerBox!.x +
      triggerBox!.width -
      (collapsedDisclosureBox!.x + collapsedDisclosureBox!.width)
    expect(Math.abs(leftInset - rightInset)).toBeLessThanOrEqual(1)

    await peopleTrigger.click()
    await expect(flagMeaningTrigger).toHaveAttribute('aria-expanded', 'false')
    await expect(flagDialog).toBeHidden()
    await expect(chapterSummary).toBeVisible()
    await expect(chapterSummary).toHaveText('中文 · 汉族')
    const expandedDisclosureBox = await chapterDisclosure.boundingBox()
    expect(expandedDisclosureBox).not.toBeNull()
    expect(expandedDisclosureBox!.x).toBeCloseTo(collapsedDisclosureBox!.x, 0)
    const infoLabel = knowledgeCard
      .locator('.knowledge-country-info-label')
      .first()
    const infoRow = knowledgeCard.locator('.knowledge-country-info-row').first()
    const infoValue = knowledgeCard
      .locator('.knowledge-country-info-row > div')
      .first()
    const [infoLabelBox, infoRowBox, infoValueBox] = await Promise.all([
      infoLabel.boundingBox(),
      infoRow.boundingBox(),
      infoValue.boundingBox(),
    ])
    expect(infoLabelBox).not.toBeNull()
    expect(infoRowBox).not.toBeNull()
    expect(infoValueBox).not.toBeNull()
    expect(Math.abs(infoLabelBox!.x - chapterIconBox!.x)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(infoLabelBox!.height - infoValueBox!.height),
    ).toBeLessThanOrEqual(1)
    expect(
      infoValueBox!.x - (infoLabelBox!.x + infoLabelBox!.width),
    ).toBeGreaterThanOrEqual(8.5)
    expect(infoLabelBox!.height).toBeLessThan(infoRowBox!.height)
    const infoLabelStyle = await infoLabel.evaluate((element) => {
      const style = getComputedStyle(element)
      return { backgroundColor: style.backgroundColor, color: style.color }
    })
    expect(infoLabelStyle.backgroundColor).toBe('rgb(54, 88, 77)')
    expect(infoLabelStyle.color).toBe('rgb(237, 243, 242)')
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false)
    await peopleTrigger.click()
    expect(actionBox!.y).toBeLessThanOrEqual(knowledgeBox!.y + 13)
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
      knowledgeBox!.x + knowledgeBox!.width - 11,
    )
    await expect(knowledgeCard.locator('.knowledge-card-footer')).toHaveCount(0)
    await expect(
      knowledgeCard.getByRole('link', { name: /在3D地球上查看/ }),
    ).toHaveAttribute('href', '/explore?country=CN')
    await expect(
      knowledgeCard.getByRole('link', { name: /在3D地球上查看/ }),
    ).toHaveText('3D')
    await expect(
      knowledgeCard.getByRole('link', { name: /在3D地球上查看/ }),
    ).toHaveCSS('background-color', 'rgb(54, 88, 77)')
    await expect(
      knowledgeCard.getByRole('link', { name: /在3D地球上查看/ }),
    ).toHaveCSS('border-radius', '6px')
    await expect(
      knowledgeCard
        .getByRole('link', { name: /在3D地球上查看/ })
        .locator('svg'),
    ).toHaveCount(0)
    await expect(
      knowledgeCard.getByRole('button', { name: /探索城市/ }),
    ).toHaveCount(0)

    await page.goto('/explore?country=CN')
    if ('safeArea' in viewport) {
      await page.evaluate((safeArea) => {
        document.documentElement.style.setProperty(
          '--atlas-safe-area-left',
          `${safeArea}px`,
        )
        document.documentElement.style.setProperty(
          '--atlas-safe-area-right',
          `${safeArea}px`,
        )
      }, viewport.safeArea)
    }
    await waitForSceneOrFallback(page)
    const globeCard = page.getByRole('complementary', {
      name: '中国国家知识卡',
    })
    await waitForKnowledgeCardSettled(globeCard)
    const globeBox = await globeCard.boundingBox()
    const globeContent = await globeCard
      .locator('.knowledge-card-content')
      .innerText()

    expect(knowledgeBox).not.toBeNull()
    expect(globeBox).not.toBeNull()
    expect(globeContent).toBe(knowledgeContent)
    expect(globeBox!.width).toBeCloseTo(knowledgeBox!.width, 0)
    expect(globeBox!.height).toBeCloseTo(knowledgeBox!.height, 0)
    expect(globeBox!.x).toBeCloseTo(knowledgeBox!.x, 0)
    await expect(
      globeCard.getByRole('link', { name: /在图鉴中学习/ }),
    ).toHaveAttribute('href', '/knowledge/countries/east-asia?country=CN')
    await expect(
      globeCard.getByRole('link', { name: /在图鉴中学习/ }),
    ).toHaveText('图鉴')
    await expect(
      globeCard.getByRole('link', { name: /在图鉴中学习/ }),
    ).toHaveCSS('background-color', 'rgb(54, 88, 77)')
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false)
  })
}

test('frames the flag in a globe country hover tooltip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { scene, fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const search = await openCountrySearch(page)
  await search.fill('德国')
  await search.press('Enter')
  await page.waitForTimeout(1_200)

  const sceneBox = await scene.boundingBox()
  expect(sceneBox).not.toBeNull()
  await page.mouse.move(
    sceneBox!.x + sceneBox!.width / 2,
    sceneBox!.y + sceneBox!.height / 2,
  )

  const tooltip = page.locator('.country-hover-tooltip')
  await expect(tooltip).toBeVisible({ timeout: 10_000 })
  await expectFramedFlag(tooltip.locator('.country-flag-frame'))
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900, touch: false },
  { name: 'phone landscape', width: 844, height: 390, touch: true },
  { name: 'iPad landscape', width: 1194, height: 834, touch: true },
]) {
  test(`uses the mini-map selection as the knowledge-map highlight standard on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })

    await page.goto('/explore?country=CN')
    const standardHighlight = await readMapHighlightStyle(
      page,
      '.world-mini-map-countries path[data-country-code="CN"].is-selected',
    )
    expect(standardHighlight).toEqual({
      fill: 'rgba(92, 145, 148, 0.82)',
      stroke: 'rgb(121, 200, 212)',
      strokeWidth: '1.15px',
      filter: 'none',
    })

    await page.goto('/knowledge/countries?continent=asia')
    expect(
      await readMapHighlightStyle(
        page,
        '.knowledge-region-map-countries path[data-country-code="CN"].is-continent',
      ),
    ).toEqual({
      fill: 'rgb(76, 201, 240)',
      stroke: 'rgb(76, 201, 240)',
      strokeWidth: '1.15px',
      filter: 'none',
    })

    await page.getByRole('tab', { name: /欧洲/ }).click()
    expect(
      await readMapHighlightStyle(
        page,
        '.knowledge-region-map-countries path[data-country-code="FR"].is-continent',
      ),
    ).toEqual({
      fill: 'rgb(255, 138, 91)',
      stroke: 'rgb(255, 138, 91)',
      strokeWidth: '1.15px',
      filter: 'none',
    })

    await page.goto('/knowledge/countries/east-asia')
    expect(
      await readMapHighlightStyle(
        page,
        '.knowledge-region-map-countries path[data-country-code="CN"].is-region',
      ),
    ).toEqual(standardHighlight)

    await page.getByRole('button', { name: '查看中国国家详情' }).click()
    expect(
      await readMapHighlightStyle(
        page,
        '.knowledge-region-map-countries path[data-country-code="JP"].is-region',
      ),
    ).toEqual(standardHighlight)

    const selectedCountryHighlight = await readMapHighlightStyle(
      page,
      '.knowledge-region-map-countries path[data-country-code="CN"].is-country',
    )
    expect(selectedCountryHighlight).toEqual({
      fill: 'rgb(242, 199, 92)',
      stroke: 'rgb(255, 241, 168)',
      strokeWidth: '1.45px',
      filter: 'none',
    })
  })
}

test('deletes legacy regional progress and redirects legacy challenge routes', async ({
  page,
}) => {
  await page.goto('/icons/scio-geo-mark.svg')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('scio-geo')
      deletion.onsuccess = () => resolve()
      deletion.onerror = () =>
        reject(new Error(deletion.error?.message ?? 'Database deletion failed'))
    })
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('scio-geo', 2)
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('preferences', { keyPath: 'id' })
        database.createObjectStore('knowledgeProgress', {
          keyPath: 'regionId',
        })
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(
          'knowledgeProgress',
          'readwrite',
        )
        transaction.objectStore('knowledgeProgress').put({
          regionId: 'east-asia',
          bestScore: 90,
          lastScore: 90,
          attemptCount: 2,
          passedAt: Date.now(),
          updatedAt: Date.now(),
        })
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () =>
          reject(new Error(transaction.error?.message ?? 'Legacy write failed'))
      }
      request.onerror = () =>
        reject(
          new Error(request.error?.message ?? 'Legacy database open failed'),
        )
    })
  })

  await page.goto('/questions')
  await expect(page.getByLabel('知识问答范围')).toContainText('0已通过')
  const stores = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('scio-geo')
        request.onsuccess = () => {
          const database = request.result
          resolve(Array.from(database.objectStoreNames))
          database.close()
        }
        request.onerror = () =>
          reject(new Error(request.error?.message ?? 'Database open failed'))
      }),
  )
  expect(stores).toContain('questionProgress')
  expect(stores).not.toContain('knowledgeProgress')

  await page.goto('/knowledge/countries/east-asia/challenge')
  await expect(page).toHaveURL(/\/questions$/)
  await page.goto('/questions/countries/east-asia')
  await expect(page).toHaveURL(/\/questions$/)
})

test('clears version 3 question progress while preserving preferences', async ({
  page,
}) => {
  await page.goto('/icons/scio-geo-mark.svg')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('scio-geo')
      deletion.onsuccess = () => resolve()
      deletion.onerror = () =>
        reject(new Error(deletion.error?.message ?? 'Database deletion failed'))
    })
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('scio-geo', 3)
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('preferences', { keyPath: 'id' })
        database.createObjectStore('questionProgress', {
          keyPath: 'challengeId',
        })
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction(
          ['preferences', 'questionProgress'],
          'readwrite',
        )
        transaction.objectStore('preferences').put({
          id: 'current',
          autoRotate: false,
          quality: 'low',
          updatedAt: 1000,
        })
        transaction.objectStore('questionProgress').put({
          challengeId: 'asia:easy',
          bestScore: 90,
          lastScore: 90,
          attemptCount: 2,
          passedAt: 1000,
          updatedAt: 1000,
        })
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () =>
          reject(new Error(transaction.error?.message ?? 'Legacy write failed'))
      }
      request.onerror = () =>
        reject(
          new Error(request.error?.message ?? 'Legacy database open failed'),
        )
    })
  })

  await page.goto('/questions')
  await expect(page.getByLabel('知识问答范围')).toContainText('0已通过')
  const stored = await page.evaluate(
    () =>
      new Promise<{ progressCount: number; autoRotate?: boolean }>(
        (resolve, reject) => {
          const request = indexedDB.open('scio-geo')
          request.onsuccess = () => {
            const database = request.result
            const transaction = database.transaction(
              ['preferences', 'questionProgress'],
              'readonly',
            )
            const progressRequest = transaction
              .objectStore('questionProgress')
              .count()
            const preferencesRequest = transaction
              .objectStore('preferences')
              .get('current')
            transaction.oncomplete = () => {
              const preferences = preferencesRequest.result as
                { autoRotate?: boolean } | undefined
              resolve({
                progressCount: progressRequest.result,
                autoRotate: preferences?.autoRotate,
              })
              database.close()
            }
            transaction.onerror = () =>
              reject(
                new Error(
                  transaction.error?.message ?? 'Migration read failed',
                ),
              )
          }
          request.onerror = () =>
            reject(new Error(request.error?.message ?? 'Database open failed'))
        },
      ),
  )
  expect(stored).toEqual({ progressCount: 0, autoRotate: false })
})

test('enters continent questions from the knowledge hub and persists the result', async ({
  page,
}) => {
  await page.goto('/knowledge')

  const knowledgeNavigation = page.getByRole('link', { name: '图鉴' })
  const questionEntry = page.getByRole('link', { name: /知识问答/ })
  await questionEntry.click()
  await expect(page).toHaveURL(/\/questions$/)
  await expect(knowledgeNavigation).toHaveClass(/is-active/)
  await expect(
    page.getByRole('heading', { name: '知识问答', level: 1 }),
  ).toBeVisible()
  await expect(page.getByLabel('知识问答范围')).toContainText(
    '195国家全球+5范围3难度',
  )

  await page.getByRole('tab', { name: /困难.*冷门国家/ }).click()
  await expect(page).toHaveURL(/\/questions\?difficulty=hard$/)
  await page.getByTestId('knowledge-question-continent-asia').click()
  await expect(page).toHaveURL(/\/questions\/asia\/hard$/)
  await expect(knowledgeNavigation).toHaveClass(/is-active/)
  await expect(page.getByText('亚洲 · 困难')).toBeVisible()

  for (let index = 0; index < 10; index += 1) {
    await answerCurrentQuestion(page)
    await page
      .getByRole('button', {
        name: index === 9 ? '查看成绩' : '下一题',
      })
      .click()
  }

  await expect(page.getByTestId('knowledge-challenge-score')).toBeVisible()
  await expect(page.locator('.knowledge-result-progress')).toBeVisible()
  await expect(page.getByRole('button', { name: '再挑战一次' })).toHaveClass(
    /is-primary/,
  )
  await expect(page.getByRole('link', { name: '返回知识问答' })).toHaveClass(
    /is-secondary/,
  )
  await page.getByRole('link', { name: '返回知识问答' }).click()
  await expect(page).toHaveURL(/\/questions\?difficulty=hard$/)

  const asia = page.getByTestId('knowledge-question-continent-asia')
  await expect(asia).toContainText('1 次挑战')
  await expect(asia).toContainText(/最高 \d+ 分/)
  await page.reload()
  await expect(asia).toContainText('1 次挑战')
})

test('keeps flag choices anonymous in separate iPadOS cards', async ({
  page,
}) => {
  await forceChoiceQuestionSequence(page)
  await page.goto('/questions/asia/easy')

  await expect(
    page.locator('.knowledge-question-card.is-country-to-flag'),
  ).toBeVisible()

  const options = page.locator('.knowledge-question-option.is-flag-choice')
  await expect(options).toHaveCount(4)
  await expect(options.locator('strong')).toHaveCount(0)
  await expect(options.locator('.country-flag-frame')).toHaveCount(4)
  await expect(options.nth(0)).toHaveAttribute('aria-label', '国旗选项 1')
  await expect(options.nth(3)).toHaveAttribute('aria-label', '国旗选项 4')

  const cardLayout = await page
    .locator('.knowledge-question-options')
    .evaluate((grid) => {
      const style = getComputedStyle(grid)
      const cards = Array.from(grid.children).map((card) => {
        const rect = card.getBoundingClientRect()
        const cardStyle = getComputedStyle(card)
        return {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          borderRadius: Number.parseFloat(cardStyle.borderRadius),
          borderWidth: Number.parseFloat(cardStyle.borderWidth),
        }
      })
      return {
        gap: Number.parseFloat(style.gap),
        borderWidth: Number.parseFloat(style.borderWidth),
        cards,
      }
    })
  expect(cardLayout.gap).toBeGreaterThan(0)
  expect(cardLayout.borderWidth).toBe(0)
  expect(cardLayout.cards.every((card) => card.borderRadius === 6)).toBe(true)
  expect(cardLayout.cards.every((card) => card.borderWidth > 0)).toBe(true)
  expect(new Set(cardLayout.cards.map((card) => card.top)).size).toBe(2)
  expect(new Set(cardLayout.cards.map((card) => card.left)).size).toBe(2)

  await options.first().focus()
  await expect(options.first()).toBeFocused()
  await page.keyboard.press('Space')
  await expect(
    page.locator('.knowledge-question-option.is-correct'),
  ).toHaveCount(1)
  await expect(page.getByText(/正确答案：/)).toBeVisible()
  await expect(options.locator('strong')).toHaveCount(0)
})

test('uses a twelve-character fill bank and keeps drafts while reviewing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.99
  })
  await page.goto('/questions/world/easy')

  await expect(
    page.getByRole('complementary', { name: '本轮状态' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '退出挑战' })).toHaveCount(0)
  const firstBank = page.getByLabel('候选中文字')
  const firstCharacters = firstBank.getByRole('button')
  await expect(firstCharacters).toHaveCount(12)
  const confirm = page.getByRole('button', { name: '确认答案' })
  await expect(confirm).toBeDisabled()
  await expect(page.getByLabel('已组成的答案')).not.toContainText(/\d+\s*\//)

  await firstCharacters.first().click()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByText(/回答正确|回答错误/)).toBeVisible()
  await page.getByRole('button', { name: '下一题' }).click()

  const secondBank = page.getByLabel('候选中文字')
  const draftCharacter = await secondBank
    .getByRole('button')
    .first()
    .innerText()
  await secondBank.getByRole('button').first().click()
  await page.getByRole('button', { name: '上一题' }).click()
  await expect(page.getByText(/回答正确|回答错误/)).toBeVisible()
  await page.getByRole('button', { name: '下一题' }).click()
  await expect(page.getByLabel('已组成的答案')).toContainText(draftCharacter)
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'small phone landscape', width: 568, height: 320 },
]) {
  test(`keeps the scheme C fill workbench usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.addInitScript(() => {
      Math.random = () => 0.99
    })
    await page.goto('/questions/world/easy')

    await expect(
      page.getByRole('complementary', { name: '本轮状态' }),
    ).toBeVisible()
    await expect(page.getByLabel('候选中文字').getByRole('button')).toHaveCount(
      12,
    )
    await expect(page.getByRole('button', { name: '确认答案' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '上一题' })).toBeDisabled()

    const geometry = await page
      .locator('.knowledge-challenge-workbench')
      .evaluate((workbench) => {
        const status = workbench.querySelector('.knowledge-challenge-status')!
        const statusBox = status.getBoundingClientRect()
        return {
          documentWidth: document.documentElement.scrollWidth,
          statusRight: statusBox.right,
          viewportWidth: document.documentElement.clientWidth,
        }
      })
    expect(geometry.documentWidth).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    )
    expect(geometry.statusRight).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  })
}

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'phone landscape', width: 844, height: 390 },
]) {
  test(`keeps challenge option cards usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.addInitScript(() => {
      Math.random = () => 0
    })
    await page.goto('/questions/asia/easy')

    const geometry = await page
      .locator('.knowledge-question-options')
      .evaluate((grid) => {
        const cards = Array.from(grid.children).map((card) => {
          const rect = card.getBoundingClientRect()
          return {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            right: rect.right,
            bottom: rect.bottom,
          }
        })
        return {
          cards,
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
          documentWidth: document.documentElement.scrollWidth,
        }
      })
    expect(new Set(geometry.cards.map((card) => card.top)).size).toBe(2)
    expect(new Set(geometry.cards.map((card) => card.left)).size).toBe(2)
    expect(geometry.documentWidth).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    )
    expect(
      geometry.cards.every(
        (card) =>
          card.right <= geometry.viewportWidth + 1 &&
          card.bottom <= geometry.viewportHeight + 1,
      ),
    ).toBe(true)
  })
}

test('switches continent regions and replaces the focused map geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1194, height: 834 })
  await page.goto('/knowledge/countries/east-asia')

  const map = page.locator('.knowledge-region-map-strip')
  const switcher = page.getByRole('navigation', { name: '亚洲子区域' })
  const readDisplayedCodes = () =>
    map
      .locator('[data-country-code]')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('data-country-code')!)
          .sort(),
      )

  await expect(map.getByRole('img', { name: '东亚区域地图' })).toBeVisible()
  await expect.poll(readDisplayedCodes).toEqual(['CN', 'JP', 'KP', 'KR', 'MN'])

  await switcher.getByRole('link', { name: /东南亚\s*11国/ }).click()
  await expect(page).toHaveURL(/\/knowledge\/countries\/southeast-asia$/)
  await expect(
    switcher.getByRole('link', { name: /东南亚\s*11国/ }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(map.getByRole('img', { name: '东南亚区域地图' })).toBeVisible()
  await expect.poll(readDisplayedCodes).toHaveLength(11)
  expect(await readDisplayedCodes()).toContain('ID')
  expect(await readDisplayedCodes()).not.toContain('CN')
  await expect(page.getByLabel('东南亚区域知识')).toBeVisible()
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'phone landscape', width: 844, height: 390 },
]) {
  test(`keeps the question hub and navigation usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.goto('/questions')

    const knowledgeNavigation = page.getByRole('link', { name: '图鉴' })
    await expect(knowledgeNavigation).toBeVisible()
    await expect(knowledgeNavigation).toHaveClass(/is-active/)
    const cards = page.locator('.knowledge-question-continent-card')
    await expect(cards).toHaveCount(6)
    await expect(
      page.getByTestId('knowledge-question-scope-world'),
    ).toBeVisible()
    await expect(
      page.getByRole('tab', { name: /简单.*最常见国家/ }),
    ).toBeVisible()

    const geometry = await page
      .locator('.knowledge-question-continent-grid')
      .evaluate((grid) => ({
        viewportWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        gridClientWidth: grid.clientWidth,
        gridScrollWidth: grid.scrollWidth,
        cardTops: Array.from(grid.children).map(
          (card) => card.getBoundingClientRect().top,
        ),
      }))
    expect(geometry.documentScrollWidth).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    )
    expect(new Set(geometry.cardTops.map((top) => Math.round(top))).size).toBe(
      1,
    )
    if (viewport.width === 844) {
      expect(geometry.gridScrollWidth).toBeGreaterThan(geometry.gridClientWidth)
    } else {
      expect(geometry.gridScrollWidth).toBeLessThanOrEqual(
        geometry.gridClientWidth + 1,
      )
    }
  })
}

for (const viewport of [
  {
    name: 'smallest landscape',
    width: 568,
    height: 320,
    touch: true,
    expectedColumns: 2,
  },
  {
    name: 'small landscape',
    width: 667,
    height: 375,
    touch: true,
    expectedColumns: 2,
  },
  {
    name: 'android phone landscape',
    width: 740,
    height: 360,
    touch: true,
    expectedColumns: 2,
  },
  {
    name: 'phone landscape',
    width: 844,
    height: 390,
    touch: true,
    expectedColumns: 3,
  },
  {
    name: 'wide phone landscape',
    width: 956,
    height: 440,
    touch: true,
    expectedColumns: 3,
  },
  {
    name: 'small tablet landscape',
    width: 1024,
    height: 600,
    touch: true,
    expectedColumns: 4,
  },
  {
    name: 'iPad landscape',
    width: 1194,
    height: 834,
    touch: true,
    expectedColumns: 4,
  },
  {
    name: 'small laptop',
    width: 1366,
    height: 768,
    touch: false,
    expectedColumns: 5,
  },
  {
    name: '1440 desktop',
    width: 1440,
    height: 900,
    touch: false,
    expectedColumns: 5,
  },
]) {
  test(`aligns dynamic country grids with the region map on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize(viewport)

    for (const regionCase of [
      {
        route: '/knowledge/countries/east-europe',
        countryCount: 4,
        title: '东欧4国',
      },
      {
        route: '/knowledge/countries/central-europe',
        countryCount: 6,
        title: '中欧6国',
      },
      {
        route: '/knowledge/countries/australia-new-zealand',
        countryCount: 2,
        title: '澳大利亚和新西兰2国',
      },
      {
        route: '/knowledge/countries/east-asia',
        countryCount: 5,
        title: '东亚5国',
      },
    ]) {
      await page.goto(regionCase.route)
      await expect(
        page.getByRole('heading', { name: regionCase.title, level: 1 }),
      ).toHaveClass('sr-only')
      await expect(page.locator('.knowledge-country-card')).toHaveCount(
        regionCase.countryCount,
      )

      const geometry = await page.evaluate(() => {
        const browser = document
          .querySelector('.knowledge-region-browser')!
          .getBoundingClientRect()
        const map = document
          .querySelector('.knowledge-region-map-strip')!
          .getBoundingClientRect()
        const grid = document
          .querySelector('.knowledge-country-grid')!
          .getBoundingClientRect()
        const cards = Array.from(
          document.querySelectorAll('.knowledge-country-card'),
        ).map((card) => card.getBoundingClientRect())
        const firstRow = cards.filter(
          (card) => Math.abs(card.y - cards[0].y) < 1,
        )
        const secondRowCard = cards.find((card) => card.y > cards[0].y + 1)
        return {
          browserX: browser.x,
          browserRight: browser.right,
          mapX: map.x,
          mapRight: map.right,
          gridX: grid.x,
          gridRight: grid.right,
          firstCardX: firstRow[0].x,
          lastCardRight: firstRow.at(-1)!.right,
          firstRowCount: firstRow.length,
          cardHeight: cards[0].height,
          rowGap: secondRowCard ? secondRowCard.y - cards[0].bottom : null,
          pageOverflows:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        }
      })

      expect(geometry.mapX).toBeCloseTo(geometry.browserX, 0)
      expect(geometry.mapRight).toBeLessThan(geometry.browserRight)
      expect(geometry.gridX).toBeCloseTo(geometry.browserX, 0)
      expect(geometry.gridRight).toBeCloseTo(geometry.browserRight, 0)
      expect(geometry.firstCardX).toBeCloseTo(geometry.browserX, 0)
      expect(geometry.lastCardRight).toBeCloseTo(geometry.browserRight, 0)
      expect(geometry.firstRowCount).toBe(
        Math.min(regionCase.countryCount, viewport.expectedColumns),
      )
      expect(geometry.cardHeight).toBeLessThanOrEqual(
        viewport.height <= 600 ? 73 : 93,
      )
      if (geometry.rowGap !== null) {
        expect(geometry.rowGap).toBeLessThanOrEqual(8.1)
      }
      expect(geometry.pageOverflows).toBe(false)
    }
  })
}

for (const viewport of [
  {
    name: 'desktop',
    width: 1440,
    height: 900,
    touch: false,
    expectedColumns: 5,
    collapsedMenu: false,
  },
  {
    name: 'iPad landscape',
    width: 1194,
    height: 834,
    touch: true,
    expectedColumns: 4,
    collapsedMenu: false,
  },
  {
    name: 'wide phone landscape',
    width: 956,
    height: 440,
    touch: true,
    expectedColumns: 3,
    collapsedMenu: false,
    safeArea: 59,
  },
  {
    name: 'phone landscape',
    width: 844,
    height: 390,
    touch: true,
    expectedColumns: 3,
    collapsedMenu: false,
  },
]) {
  test(`keeps the knowledge atlas usable on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.goto('/knowledge/countries')

    await expect(
      page.getByRole('heading', { name: '国家首都', level: 1 }),
    ).toHaveClass('sr-only')
    const geometry = await page
      .locator('.knowledge-shell')
      .evaluate((shell) => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientHeight: shell.clientHeight,
        scrollHeight: shell.scrollHeight,
      }))
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
    expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight)

    await page.getByTestId('knowledge-region-east-asia').click()
    if ('safeArea' in viewport) {
      await page.evaluate((safeArea) => {
        document.documentElement.style.setProperty(
          '--atlas-safe-area-left',
          `${safeArea}px`,
        )
        document.documentElement.style.setProperty(
          '--atlas-safe-area-right',
          `${safeArea}px`,
        )
        window.dispatchEvent(new Event('resize'))
      }, viewport.safeArea)
    }
    await expect(page.getByRole('link', { name: '开始区域挑战' })).toHaveCount(
      0,
    )
    const regionCard = page.getByLabel('东亚区域知识')
    await waitForKnowledgeCardSettled(regionCard)
    await expect(regionCard).toContainText('自然地理')
    await expect(regionCard).toContainText('人文地理')
    await expect(regionCard).toContainText('学习要点')
    await expect(regionCard.getByRole('button')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: '东亚5国', level: 1 }),
    ).toHaveClass('sr-only')
    await expect(page.locator('.knowledge-region-page-header')).toHaveCount(0)
    await expect(page.getByRole('link', { name: '← 返回亚洲' })).toHaveCount(0)
    const navigation = page.getByRole('navigation', {
      name: 'Scio Geo 主导航',
    })
    const displayTrigger = page.getByRole('button', {
      name: '显示国家卡内容',
    })
    if (viewport.collapsedMenu) {
      await expect(displayTrigger).toBeVisible()
      await displayTrigger.click()
    } else {
      await expect(displayTrigger).toHaveCount(0)
    }
    const displayControls = page.getByRole('group', {
      name: '国家卡显示内容',
    })
    await expect(displayControls).toBeVisible()
    await expect(displayControls.locator('button')).toHaveText([
      '国旗',
      '国家',
      '首都',
    ])
    await expect(
      displayControls.getByRole('button', { name: '国旗' }),
    ).toBeDisabled()
    const map = page.locator('.knowledge-region-map-strip')
    const regionBrowser = page.locator('.knowledge-region-browser')
    const regionSwitcher = page.getByRole('navigation', {
      name: '亚洲子区域',
    })
    await expect(regionSwitcher.getByRole('link')).toHaveCount(5)
    await expect(
      regionSwitcher.getByRole('link', { name: /东亚\s*5国/ }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(map.getByRole('link')).toHaveCount(0)
    await expect(map.getByText('WORLD POSITION')).toHaveCount(0)
    await expect(
      map.getByRole('img', { name: '东亚区域地图' }),
    ).toHaveAttribute('data-map-scope', 'region')
    await expect(map.locator('.knowledge-region-map-grid')).toHaveCount(0)
    await expect(map.locator('.knowledge-region-map-landmasses')).toHaveCount(0)
    const mapCountryPaths = map.locator('.knowledge-region-map-countries')
    await expect(mapCountryPaths.locator('path.is-region')).toHaveCount(5)
    await expect(mapCountryPaths.locator('path.is-continent')).toHaveCount(0)
    await expect(page.locator('.knowledge-region-map-actions')).toHaveCount(0)
    await expect(page.getByTestId('knowledge-region-best-score')).toHaveCount(0)
    const countryGrid = page.locator('.knowledge-country-grid')
    const [
      mapBefore,
      regionBrowserBox,
      regionSwitcherLayout,
      navigationBox,
      controlsBox,
      triggerBox,
      gridBefore,
      regionCardBox,
    ] = await Promise.all([
      map.evaluate((element) => ({
        x: element.getBoundingClientRect().x,
        y: element.getBoundingClientRect().y,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        pathLeft: Math.min(
          ...Array.from(
            element.querySelectorAll('.knowledge-region-map-countries path'),
          ).map((path) => path.getBoundingClientRect().left),
        ),
        pathRight: Math.max(
          ...Array.from(
            element.querySelectorAll('.knowledge-region-map-countries path'),
          ).map((path) => path.getBoundingClientRect().right),
        ),
        pathTop: Math.min(
          ...Array.from(
            element.querySelectorAll('.knowledge-region-map-countries path'),
          ).map((path) => path.getBoundingClientRect().top),
        ),
        pathBottom: Math.max(
          ...Array.from(
            element.querySelectorAll('.knowledge-region-map-countries path'),
          ).map((path) => path.getBoundingClientRect().bottom),
        ),
        viewBox: element.querySelector('svg')?.getAttribute('viewBox'),
      })),
      regionBrowser.boundingBox(),
      regionSwitcher.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const active = element
          .querySelector('[aria-current="page"]')!
          .getBoundingClientRect()
        return {
          x: bounds.x,
          right: bounds.right,
          height: bounds.height,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          activeFullyVisible:
            active.top >= bounds.top - 1 && active.bottom <= bounds.bottom + 1,
        }
      }),
      navigation.boundingBox(),
      displayControls.boundingBox(),
      viewport.collapsedMenu
        ? displayTrigger.boundingBox()
        : Promise.resolve(null),
      countryGrid.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const cards = Array.from(
          element.querySelectorAll('.knowledge-country-card'),
        ).map((card) => card.getBoundingClientRect())
        return {
          x: box.x,
          right: box.right,
          width: box.width,
          firstRowCount: cards.filter(
            (card) => Math.abs(card.y - cards[0].y) < 1,
          ).length,
        }
      }),
      regionCard.boundingBox(),
    ])
    expect(regionBrowserBox).not.toBeNull()
    expect(mapBefore.x).toBeCloseTo(regionBrowserBox!.x, 0)
    expect(mapBefore.x + mapBefore.width).toBeLessThan(
      regionBrowserBox!.x + regionBrowserBox!.width,
    )
    expect(regionSwitcherLayout.x).toBeGreaterThanOrEqual(
      mapBefore.x + mapBefore.width,
    )
    expect(regionSwitcherLayout.right).toBeCloseTo(
      regionBrowserBox!.x + regionBrowserBox!.width,
      0,
    )
    expect(regionSwitcherLayout.height).toBeCloseTo(regionBrowserBox!.height, 0)
    expect(regionSwitcherLayout.activeFullyVisible).toBe(true)
    if (viewport.height <= 600) {
      expect(mapBefore.height).toBeGreaterThanOrEqual(120)
      expect(mapBefore.height).toBeLessThanOrEqual(145)
      expect(regionSwitcherLayout.scrollHeight).toBeGreaterThan(
        regionSwitcherLayout.clientHeight,
      )
    } else {
      expect(mapBefore.height).toBeCloseTo(240, 0)
      expect(regionSwitcherLayout.scrollHeight).toBeLessThanOrEqual(
        regionSwitcherLayout.clientHeight + 1,
      )
    }
    expect(mapBefore.pathLeft).toBeGreaterThanOrEqual(mapBefore.x)
    expect(mapBefore.pathRight).toBeLessThanOrEqual(
      mapBefore.x + mapBefore.width + 1,
    )
    expect(mapBefore.pathTop).toBeGreaterThanOrEqual(mapBefore.y)
    expect(mapBefore.pathBottom).toBeLessThanOrEqual(
      mapBefore.y + mapBefore.height + 1,
    )
    expect(
      (mapBefore.pathRight - mapBefore.pathLeft) / mapBefore.width,
    ).toBeGreaterThan(0.45)
    expect(
      (mapBefore.pathBottom - mapBefore.pathTop) / mapBefore.height,
    ).toBeGreaterThan(0.45)
    expect(navigationBox).not.toBeNull()
    expect(controlsBox).not.toBeNull()
    expect(regionCardBox).not.toBeNull()
    expect(regionCardBox!.x).toBeGreaterThanOrEqual(0)
    expect(regionCardBox!.x + regionCardBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    expect(mapBefore.x + mapBefore.width).toBeLessThanOrEqual(
      regionCardBox!.x + 1,
    )
    expect(mapBefore.y).toBeLessThanOrEqual(24)
    if (viewport.collapsedMenu) {
      expect(triggerBox).not.toBeNull()
      expect(triggerBox!.x).toBeCloseTo(navigationBox!.x, 0)
      expect(triggerBox!.width).toBeCloseTo(navigationBox!.width, 0)
      expect(triggerBox!.y).toBeGreaterThanOrEqual(
        navigationBox!.y + navigationBox!.height,
      )
      expect(controlsBox!.x).toBeGreaterThanOrEqual(
        navigationBox!.x + navigationBox!.width,
      )
      expect(controlsBox!.y).toBeGreaterThanOrEqual(0)
      expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(
        viewport.height + 1,
      )
    } else {
      expect(controlsBox!.x).toBeCloseTo(navigationBox!.x, 0)
      expect(controlsBox!.width).toBeCloseTo(navigationBox!.width, 0)
      expect(controlsBox!.y).toBeGreaterThanOrEqual(
        navigationBox!.y + navigationBox!.height,
      )
    }
    expect(gridBefore.x).toBeCloseTo(regionBrowserBox!.x, 0)
    expect(gridBefore.right).toBeCloseTo(
      regionBrowserBox!.x + regionBrowserBox!.width,
      0,
    )
    expect(gridBefore.firstRowCount).toBe(viewport.expectedColumns)

    const chinaCard = page
      .getByRole('button', { name: '查看中国国家详情' })
      .locator('..')
    const flagOnlyBox = await chinaCard
      .locator('.country-flag-frame')
      .boundingBox()
    expect(flagOnlyBox).not.toBeNull()
    await displayControls
      .getByRole('button', { name: '国家', exact: true })
      .click()
    await displayControls
      .getByRole('button', { name: '首都', exact: true })
      .click()
    const verticalFields = await chinaCard
      .locator('.knowledge-country-open > *')
      .evaluateAll((fields) =>
        fields.map((field) => {
          const box = field.getBoundingClientRect()
          return {
            className: field.getAttribute('class') ?? '',
            centerX: box.x + box.width / 2,
            y: box.y,
          }
        }),
      )
    expect(verticalFields.map((field) => field.className)).toEqual([
      'country-flag-frame',
      'knowledge-country-name',
      'knowledge-country-card-capital',
    ])
    expect(verticalFields[0].y).toBeLessThan(verticalFields[1].y)
    expect(verticalFields[1].y).toBeLessThan(verticalFields[2].y)
    expect(verticalFields[0].centerX).toBeCloseTo(verticalFields[1].centerX, 0)
    expect(verticalFields[1].centerX).toBeCloseTo(verticalFields[2].centerX, 0)
    const flagWithFieldsBox = await chinaCard
      .locator('.country-flag-frame')
      .boundingBox()
    expect(flagWithFieldsBox).not.toBeNull()
    expect(flagWithFieldsBox!.width).toBeCloseTo(flagOnlyBox!.width, 1)
    expect(flagWithFieldsBox!.height).toBeCloseTo(flagOnlyBox!.height, 1)

    const capitalField = chinaCard.locator('.knowledge-country-card-capital')
    const capitalChinese = capitalField.locator('strong')
    const capitalEnglish = capitalField.locator('small')
    await expect(capitalChinese).toHaveText('北京')
    await expect(capitalEnglish).toHaveText('Beijing')
    await expect(capitalField.getByText('首都', { exact: true })).toHaveCount(0)
    const [capitalChineseBox, capitalEnglishBox] = await Promise.all([
      capitalChinese.boundingBox(),
      capitalEnglish.boundingBox(),
    ])
    expect(capitalChineseBox).not.toBeNull()
    expect(capitalEnglishBox).not.toBeNull()
    expect(capitalChineseBox!.y).toBeLessThan(capitalEnglishBox!.y)

    await page.getByRole('button', { name: '查看中国国家详情' }).click()
    await expect(regionCard).toHaveCount(0)
    await expect(mapCountryPaths.locator('path.is-country')).toHaveCount(1)
    await expect(
      mapCountryPaths.locator('path[data-country-code="CN"].is-country'),
    ).toHaveCount(1)
    await expect(mapCountryPaths.locator('path.is-region')).toHaveCount(4)
    const detail = page.getByLabel('中国国家学习详情')
    await waitForKnowledgeCardSettled(detail)
    const [mapAfter, gridAfter, detailBox] = await Promise.all([
      map.evaluate((element) => ({
        x: element.getBoundingClientRect().x,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        viewBox: element.querySelector('svg')?.getAttribute('viewBox'),
      })),
      countryGrid.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const cards = Array.from(
          element.querySelectorAll('.knowledge-country-card'),
        ).map((card) => card.getBoundingClientRect())
        return {
          x: box.x,
          right: box.right,
          width: box.width,
          firstRowCount: cards.filter(
            (card) => Math.abs(card.y - cards[0].y) < 1,
          ).length,
        }
      }),
      detail.boundingBox(),
    ])
    expect(detailBox).not.toBeNull()
    expect(detailBox!.x).toBeGreaterThanOrEqual(0)
    expect(detailBox!.x + detailBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    expect(mapAfter.width).toBeCloseTo(mapBefore.width, 0)
    expect(mapAfter.height).toBeCloseTo(mapBefore.height, 0)
    expect(mapAfter.viewBox).toBe(mapBefore.viewBox)
    expect(gridAfter.width).toBeCloseTo(gridBefore.width, 0)
    expect(gridAfter.x).toBeCloseTo(regionBrowserBox!.x, 0)
    expect(gridAfter.right).toBeCloseTo(
      regionBrowserBox!.x + regionBrowserBox!.width,
      0,
    )
    expect(gridAfter.firstRowCount).toBe(viewport.expectedColumns)
    expect(mapAfter.x + mapAfter.width).toBeLessThanOrEqual(detailBox!.x + 1)
    expect(gridAfter.x + gridAfter.width).toBeLessThanOrEqual(detailBox!.x + 1)
    expect(detailBox!.width).toBeCloseTo(regionCardBox!.width, 0)

    await expect(
      detail.getByRole('button', { name: '关闭国家学习详情' }),
    ).toHaveCount(0)
  })
}

for (const viewport of [
  { name: 'smallest landscape', width: 568, height: 320 },
]) {
  test(`keeps the collapsed country field menu usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        configurable: true,
        value: 5,
      })
      Object.defineProperty(navigator, 'platform', {
        configurable: true,
        value: 'MacIntel',
      })
    })
    await page.setViewportSize(viewport)
    await page.goto('/knowledge/countries/southeast-asia')

    const navigation = page.getByRole('navigation', {
      name: 'Scio Geo 主导航',
    })
    const trigger = page.getByRole('button', {
      name: '显示国家卡内容',
    })
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()

    const controls = page.getByRole('group', { name: '国家卡显示内容' })
    await expect(controls).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const [navigationBox, triggerBox, controlsBox, buttonHeights] =
      await Promise.all([
        navigation.boundingBox(),
        trigger.boundingBox(),
        controls.boundingBox(),
        controls
          .getByRole('button')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getBoundingClientRect().height),
          ),
      ])
    expect(navigationBox).not.toBeNull()
    expect(triggerBox).not.toBeNull()
    expect(controlsBox).not.toBeNull()
    expect(triggerBox!.x).toBeCloseTo(navigationBox!.x, 0)
    expect(triggerBox!.y).toBeGreaterThanOrEqual(
      navigationBox!.y + navigationBox!.height,
    )
    expect(triggerBox!.height).toBeGreaterThanOrEqual(44)
    expect(controlsBox!.x).toBeGreaterThanOrEqual(
      navigationBox!.x + navigationBox!.width + 5,
    )
    expect(controlsBox!.y).toBeGreaterThanOrEqual(0)
    expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )
    expect(buttonHeights.every((height) => height >= 44)).toBe(true)

    await controls.getByRole('button', { name: '国家' }).click()
    await expect(
      controls.getByRole('button', { name: '国家' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(controls).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(controls).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(controls).toBeVisible()
    await page
      .locator('.knowledge-region-map-strip')
      .click({ position: { x: 8, y: 8 } })
    await expect(controls).toBeHidden()
    await expect(trigger).toBeFocused()
  })
}

test('exposes a valid PWA manifest', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBeTruthy()

  const manifest = (await manifestResponse.json()) as {
    name: string
    display: string
    display_override: string[]
    orientation: string
    icons: Array<{ src: string }>
  }

  expect(manifest.name).toContain('Scio Geo')
  expect(manifest.display).toBe('standalone')
  expect(manifest.display_override).toEqual(['fullscreen', 'standalone'])
  expect(manifest.orientation).toBe('landscape')
  expect(manifest.icons).toHaveLength(3)
})

test('toggles fullscreen from the primary-page logo and preserves state on descendants', async ({
  page,
}) => {
  await installFullscreenApiMock(page)
  await page.goto('/explore')

  const enterFullscreen = page.getByRole('button', {
    name: 'Scio Geo，双击进入全屏',
  })
  await enterFullscreen.click()
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await enterFullscreen.dblclick()
  await expect(
    page.getByRole('button', { name: 'Scio Geo，双击退出全屏' }),
  ).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('link', { name: '图鉴' }).click()
  await page.getByTestId('knowledge-home-module-countries').click()
  await expect(page).toHaveURL(/\/knowledge\/countries$/)
  await page.getByRole('tab', { name: /亚洲/ }).click()
  await page.getByTestId('knowledge-region-east-asia').click()
  await expect(page).toHaveURL(/\/knowledge\/countries\/east-asia$/)
  await expect(
    page.getByRole('button', { name: 'Scio Geo，双击退出全屏' }),
  ).toHaveCount(0)
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(
    true,
  )

  await page.getByRole('button', { name: '返回上一级' }).click()
  await expect(page).toHaveURL(/\/knowledge\/countries$/)
  await page.getByRole('button', { name: '返回上一级' }).click()
  await expect(page).toHaveURL(/\/knowledge$/)
  const exitFullscreen = page.getByRole('button', {
    name: 'Scio Geo，双击退出全屏',
  })
  await page.evaluate(() => document.exitFullscreen())
  await expect(
    page.getByRole('button', { name: 'Scio Geo，双击进入全屏' }),
  ).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('button', { name: 'Scio Geo，双击进入全屏' }).dblclick()
  await expect(exitFullscreen).toBeVisible()
})

for (const viewport of [
  { name: '1440 desktop', width: 1440, height: 900, touch: false },
  { name: 'iPad landscape', width: 1194, height: 834, touch: true },
  { name: 'phone landscape', width: 844, height: 390, touch: true },
]) {
  test(`keeps three navigation links and the fullscreen logo inside navigation on ${viewport.name}`, async ({
    page,
  }) => {
    await installFullscreenApiMock(page)
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.goto('/explore')

    const navigation = page.getByRole('navigation', {
      name: 'Scio Geo 主导航',
    })
    const logo = page.getByRole('button', {
      name: 'Scio Geo，双击进入全屏',
    })
    await expect(logo).toBeVisible()
    await expect(page.getByText('全屏', { exact: true })).toHaveCount(0)
    const [layout, logoBox] = await Promise.all([
      navigation.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const items = Array.from(
          element.querySelectorAll<HTMLElement>('.app-navigation-link'),
          (item) => {
            const itemBox = item.getBoundingClientRect()
            return { top: itemBox.top, bottom: itemBox.bottom }
          },
        )
        return {
          top: box.top,
          bottom: box.bottom,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          items,
        }
      }),
      logo.boundingBox(),
    ])

    expect(logoBox).not.toBeNull()
    expect(logoBox!.width).toBeGreaterThanOrEqual(44)
    expect(logoBox!.height).toBeGreaterThanOrEqual(44)
    expect(layout.top).toBeGreaterThanOrEqual(5)
    expect(layout.bottom).toBeLessThanOrEqual(viewport.height - 5)
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1)
    expect(layout.items).toHaveLength(3)
    for (let index = 1; index < layout.items.length; index += 1) {
      expect(layout.items[index].top).toBeGreaterThanOrEqual(
        layout.items[index - 1].bottom,
      )
    }
  })
}

test('asks touch phones and iPads to rotate before loading the app', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 834, height: 1194 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const prompt = page.getByTestId('landscape-prompt')
    await expect(prompt).toBeVisible()
    await expect(
      prompt.getByRole('heading', { name: '请将设备横过来' }),
    ).toBeVisible()
    await expect(page.getByTestId('globe-scene')).toHaveCount(0)
    await expect(page.getByTestId('webgl-fallback')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /Scio Geo，双击.*全屏/ }),
    ).toHaveCount(0)
  }
})

test('enters landscape automatically and preserves the mounted experience', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByTestId('landscape-prompt')).toBeVisible()

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByTestId('landscape-prompt')).toHaveCount(0)
  const { scene, fallback } = await waitForSceneOrFallback(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('landscape-prompt')).toBeVisible()
  await expect(scene.or(fallback)).toBeAttached()

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByTestId('landscape-prompt')).toHaveCount(0)
  await expect(scene.or(fallback)).toBeVisible({ timeout: 15_000 })
})

test('adapts persistent knowledge-card width on ultrawide touch phones', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })

  for (const viewport of [
    { width: 568, height: 320, cardWidth: 240 },
    { width: 740, height: 360, cardWidth: 259 },
    { width: 844, height: 390, cardWidth: 320 },
    { width: 956, height: 440, cardWidth: 320 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/explore')

    const card = page.getByLabel('3D 地球使用说明')
    const controls = page.getByRole('navigation', { name: '地球显示控制' })
    const layerTrigger = page.getByRole('button', {
      name: /图层，已开启 \d+ 项/,
    })
    const miniMap = page.getByLabel('2D 世界定位图')
    await expect(card).toBeVisible()
    await waitForKnowledgeCardSettled(card)
    const [cardBox, controlsBox, layerBox, miniMapBox] = await Promise.all([
      card.boundingBox(),
      controls.boundingBox(),
      layerTrigger.boundingBox(),
      miniMap.boundingBox(),
    ])
    expect(cardBox).not.toBeNull()
    expect(controlsBox).not.toBeNull()
    expect(layerBox).not.toBeNull()
    expect(miniMapBox).not.toBeNull()
    expect(
      Math.abs(cardBox!.width - viewport.cardWidth),
      `${viewport.width}×${viewport.height} card width`,
    ).toBeLessThanOrEqual(2)
    expect(miniMapBox!.x + miniMapBox!.width).toBeLessThanOrEqual(
      controlsBox!.x,
    )
    expect(controlsBox!.x + controlsBox!.width).toBeLessThanOrEqual(cardBox!.x)
    expect(
      Math.abs(
        controlsBox!.x + controlsBox!.width - layerBox!.x - layerBox!.width,
      ),
    ).toBeLessThanOrEqual(1)
  }

  await page.goto('/knowledge/countries/east-asia')
  const knowledgeCard = page.getByLabel('东亚区域知识')
  await expect(knowledgeCard).toBeVisible()
  await waitForKnowledgeCardSettled(knowledgeCard)
  expect((await knowledgeCard.boundingBox())!.width).toBeCloseTo(320, 0)
  await expect(knowledgeCard.getByRole('heading', { name: '东亚' })).toHaveCSS(
    'font-size',
    '20px',
  )
})

test('suppresses touch context menus while preserving search editing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 1194, height: 834 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const trigger = page.getByRole('link', { name: '图鉴' })
    const blockedResult = await trigger.evaluate((element) => {
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      })
      return {
        dispatched: element.dispatchEvent(event),
        defaultPrevented: event.defaultPrevented,
      }
    })
    expect(blockedResult).toEqual({
      dispatched: false,
      defaultPrevented: true,
    })

    const runtime = page.getByTestId('landscape-runtime')
    await expect(runtime).toHaveClass(/is-touch-device/)
    expect(
      await runtime.evaluate((element) => getComputedStyle(element).userSelect),
    ).toBe('none')

    const search = await openCountrySearch(page)
    const allowedResult = await search.evaluate((element) => {
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      })
      return {
        dispatched: element.dispatchEvent(event),
        defaultPrevented: event.defaultPrevented,
        userSelect: getComputedStyle(element).userSelect,
      }
    })
    expect(allowedResult).toEqual({
      dispatched: true,
      defaultPrevented: false,
      userSelect: 'text',
    })

    await search.fill('中国')
    await search.selectText()
    expect(
      await search.evaluate((element) => {
        const input = element as HTMLInputElement
        return {
          value: input.value,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
        }
      }),
    ).toEqual({ value: '中国', selectionStart: 0, selectionEnd: 2 })
  }
})

test('keeps phone landscape controls separated and country details usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const map = page.getByTestId('world-mini-map')
  const controls = page.getByRole('navigation', { name: '地球显示控制' })
  const layerControl = await openLayerControl(page)
  await expect(map).toBeVisible()
  await expect(page.getByRole('button', { name: '定位图' })).toBeHidden()
  await expect(controls).toBeVisible()
  await expect(layerControl).toBeVisible()

  const mapBox = await map.boundingBox()
  const controlsBox = await controls.boundingBox()
  const layerControlBox = await layerControl.boundingBox()
  const layerPanelBox = await layerControl
    .getByRole('region', { name: '图层选择' })
    .boundingBox()
  expect(mapBox).not.toBeNull()
  expect(controlsBox).not.toBeNull()
  expect(layerControlBox).not.toBeNull()
  expect(layerPanelBox).not.toBeNull()
  const layoutEdge = Math.min(8, Math.max(4, 844 * 0.01))
  expect(mapBox!.x + mapBox!.width).toBeLessThanOrEqual(controlsBox!.x)
  expect(layerControlBox!.x).toBeGreaterThanOrEqual(layoutEdge)
  expect(layerControlBox!.y).toBeCloseTo(layoutEdge, 0)
  expect(layerControlBox!.y + layerControlBox!.height).toBeLessThan(mapBox!.y)
  expect(layerPanelBox!.x).toBeGreaterThanOrEqual(mapBox!.x + mapBox!.width)
  expect(layerPanelBox!.x + layerPanelBox!.width).toBeLessThanOrEqual(
    844 - layoutEdge + 1,
  )
  expect(layerPanelBox!.y).toBeGreaterThanOrEqual(
    layerControlBox!.y + layerControlBox!.height,
  )
  expect(layerPanelBox!.y + layerPanelBox!.height).toBeLessThanOrEqual(
    controlsBox!.y,
  )

  const search = await openCountrySearch(page)
  await expect(search).toBeVisible()
  const searchPageBox = await page.locator('.search-page-content').boundingBox()
  const results = page.getByRole('listbox', { name: '地点搜索结果' })
  const popoverBox = await page.locator('.country-search-popover').boundingBox()
  expect(searchPageBox).not.toBeNull()
  expect(popoverBox).not.toBeNull()
  await expect(results).toBeVisible()
  expect(searchPageBox!.x).toBeGreaterThanOrEqual(64)
  expect(searchPageBox!.x + searchPageBox!.width).toBeLessThanOrEqual(832)
  expect(popoverBox!.y).toBeGreaterThanOrEqual(layoutEdge)

  await search.fill('中国')
  await search.press('Enter')
  const card = page.getByLabel('中国国家知识卡')
  await expect(card).toBeVisible()
  await expect
    .poll(async () => (await card.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(13)
  const cardBox = await card.boundingBox()
  expect(cardBox).not.toBeNull()
  expect(cardBox!.y).toBeCloseTo(layoutEdge, 0)
  expect(390 - cardBox!.y - cardBox!.height).toBeCloseTo(layoutEdge, 0)
  expect(controlsBox!.x + controlsBox!.width).toBeLessThanOrEqual(cardBox!.x)
  await expect(
    card.getByRole('button', { name: '关闭国家知识卡' }),
  ).toHaveCount(0)
  await expect(card.getByText('14.1亿人')).toBeVisible()

  await card.getByRole('button', { name: /^主要城市/ }).click()
  const cityRows = card.locator('.knowledge-country-city-row')
  await expect(cityRows).toHaveCount(5)
  await expect(cityRows.nth(1)).toHaveText('上海Shanghai')
  await expect(cityRows.nth(1).locator('[title="Shanghai"]')).toBeVisible()
  await expect(card.getByRole('button', { name: /探索城市/ })).toHaveCount(0)
  await expect(page.getByLabel('上海城市知识卡')).toHaveCount(0)
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`reserves the ${viewport.width}px desktop stage for persistent knowledge cards`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const { scene, fallback } = await waitForSceneOrFallback(page)
    if (await fallback.isVisible()) return

    const initialSceneBox = await scene.boundingBox()
    const initialGuideBox = await page
      .getByLabel('3D 地球使用说明')
      .boundingBox()
    expect(initialSceneBox).not.toBeNull()
    expect(initialGuideBox).not.toBeNull()
    expect(initialSceneBox!.x).toBeLessThanOrEqual(1)
    expect(initialSceneBox!.y).toBeLessThanOrEqual(1)
    expect(initialSceneBox!.height).toBeGreaterThanOrEqual(viewport.height - 1)
    expect(initialSceneBox!.x + initialSceneBox!.width).toBeLessThanOrEqual(
      initialGuideBox!.x,
    )

    const search = await openCountrySearch(page)
    await search.fill('中国')
    await search.press('Enter')

    const card = page.getByLabel('中国国家知识卡')
    const controls = page.getByRole('navigation', { name: '地球显示控制' })
    const layerTrigger = page.getByRole('button', {
      name: /图层，已开启 \d+ 项/,
    })
    const map = page.getByTestId('world-mini-map')
    await expect
      .poll(
        async () => (await card.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
      )
      .toBeLessThanOrEqual(13)
    const [sceneBox, cardBox, controlsBox, mapBox, layerBox] =
      await Promise.all([
        scene.boundingBox(),
        card.boundingBox(),
        controls.boundingBox(),
        map.boundingBox(),
        layerTrigger.boundingBox(),
      ])
    expect(sceneBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    expect(controlsBox).not.toBeNull()
    expect(mapBox).not.toBeNull()
    expect(layerBox).not.toBeNull()
    expect(sceneBox!.width).toBeCloseTo(initialSceneBox!.width, 0)
    expect(cardBox!.width).toBeCloseTo(initialGuideBox!.width, 0)
    expect(
      await page.evaluate(() => ({
        page: window.scrollY,
        shell: document.querySelector('.explore-shell')?.scrollTop ?? 0,
      })),
    ).toEqual({ page: 0, shell: 0 })
    expect(sceneBox!.x + sceneBox!.width).toBeLessThanOrEqual(cardBox!.x)
    expect(cardBox!.y + cardBox!.height).toBeGreaterThanOrEqual(
      viewport.height - 13,
    )
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(
      viewport.height - 11,
    )
    expect(mapBox!.x).toBeLessThanOrEqual(13)
    expect(mapBox!.y + mapBox!.height).toBeGreaterThanOrEqual(
      viewport.height - 13,
    )
    expect(mapBox!.x + mapBox!.width).toBeLessThanOrEqual(controlsBox!.x)
    expect(controlsBox!.x + controlsBox!.width).toBeLessThanOrEqual(cardBox!.x)

    expect(
      Math.abs(
        controlsBox!.x + controlsBox!.width - layerBox!.x - layerBox!.width,
      ),
    ).toBeLessThanOrEqual(1)

    const controlLabels = await controls
      .locator('.control-button > span:last-child')
      .evaluateAll((labels) =>
        labels.map((label) => ({
          width: (label as HTMLElement).getBoundingClientRect().width,
          height: (label as HTMLElement).getBoundingClientRect().height,
        })),
      )
    expect(
      controlLabels.every(({ width, height }) => width <= 1 && height <= 1),
    ).toBe(true)
  })
}

test('keeps controls reachable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: '转动地球，发现每一片土地' }),
  ).toHaveCount(0)

  const scene = page.getByTestId('globe-scene')
  if (await scene.isVisible()) {
    await expect(page.getByRole('button', { name: '重置视角' })).toBeVisible()
    await expect(page.getByRole('button', { name: '定位图' })).toBeVisible()
  }
})

test('keeps the 2D map synchronized with country and globe navigation', async ({
  page,
}) => {
  await page.goto('/')

  const { scene, fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const map = page.getByTestId('world-mini-map')
  const marker = page.getByTestId('world-mini-map-view-marker')
  const initialTransform = await marker.getAttribute('transform')
  const initialMapBox = await map.boundingBox()
  expect(initialMapBox).not.toBeNull()

  await page.mouse.click(
    initialMapBox!.x + initialMapBox!.width * ((2.3 + 180) / 360),
    initialMapBox!.y + initialMapBox!.height * ((90 - 48.8) / 180),
  )
  await expect(page.getByLabel('法国国家知识卡')).toBeVisible()
  await expect(map.locator('[data-country-code="FR"]')).toHaveClass(
    /is-selected/,
  )
  await expect
    .poll(() => marker.getAttribute('transform'))
    .not.toBe(initialTransform)

  await page.mouse.click(
    initialMapBox!.x + initialMapBox!.width * ((121 + 180) / 360),
    initialMapBox!.y + initialMapBox!.height * ((90 - 23.7) / 180),
  )
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  await expect(map.locator('[data-country-code="CN"]')).toHaveClass(
    /is-selected/,
  )

  const sceneBox = await scene.boundingBox()
  expect(sceneBox).not.toBeNull()
  const markerBeforeDrag = await marker.getAttribute('transform')
  await page.mouse.move(
    sceneBox!.x + sceneBox!.width * 0.56,
    sceneBox!.y + sceneBox!.height * 0.48,
  )
  await page.mouse.down()
  await page.mouse.move(
    sceneBox!.x + sceneBox!.width * 0.7,
    sceneBox!.y + sceneBox!.height * 0.55,
    { steps: 8 },
  )
  await page.mouse.up()
  await expect
    .poll(() => marker.getAttribute('transform'))
    .not.toBe(markerBeforeDrag)

  const mapBox = await map.boundingBox()
  expect(mapBox).not.toBeNull()
  await page.mouse.click(
    mapBox!.x + mapBox!.width * (40 / 360),
    mapBox!.y + mapBox!.height * 0.5,
  )
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  await expect(map.locator('[data-country-code="CN"]')).toHaveClass(
    /is-selected/,
  )
})

test('shows global capitals and expands the selected country in the city layer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const cityToggle = layerControl.getByRole('button', { name: '城市' })
  const labels = page.locator('.city-label:not([hidden])')
  const cityLabels = page.locator('.city-label[data-city-id]')
  await expect(labels).toHaveCount(0)
  await cityToggle.click()
  await expect(cityToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(cityLabels).toHaveCount(197)
  await expect(page.locator('[data-city-id="cn-shanghai"]')).toHaveCount(0)
  await expect.poll(() => labels.count()).toBeGreaterThan(0)
  expect(await labels.count()).toBeLessThanOrEqual(30)
  expect(
    await page.locator('.city-label.is-capital:not([hidden])').count(),
  ).toBeGreaterThan(0)

  const map = page.getByTestId('world-mini-map')
  await map.locator('[data-country-code="CN"]').first().click({ force: true })
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  await expect(cityLabels).toHaveCount(201)
  await expect(page.locator('[data-city-id="cn-shanghai"]')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  await expect(page.locator('button.city-label.is-city')).toHaveCount(0)

  await map.locator('[data-country-code="US"]').first().click({ force: true })
  await expect(page.getByLabel('美国国家知识卡')).toBeVisible()
  await expect(page.locator('[data-city-id="cn-shanghai"]')).toHaveCount(0)
  await expect(page.locator('[data-city-id="us-new-york"]')).toHaveCount(1)
  await expect(cityLabels).toHaveCount(201)

  const reopenedLayerControl = await openLayerControl(page)
  await reopenedLayerControl.getByRole('button', { name: '城市' }).click()
  await expect(labels).toHaveCount(0)

  const search = await openCountrySearch(page)
  await search.fill('上海')
  await expect(page.getByText('找到 0 个匹配项')).toBeVisible()
})

test('toggles waterbody layers, searches a sea, and replaces its selected range', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const oceanToggle = layerControl.getByRole('button', { name: '海洋' })
  const waterwayToggle = layerControl.getByRole('button', { name: '水域' })
  await expect(oceanToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(waterwayToggle).toHaveAttribute('aria-pressed', 'false')
  await oceanToggle.click()
  await waterwayToggle.click()
  await expect
    .poll(() => page.locator('[data-waterbody-id]:not([hidden])').count())
    .toBeGreaterThan(0)

  let search = await openCountrySearch(page)
  await search.fill('地中海')
  await search.press('Enter')
  const mediterraneanCard = page.getByLabel('地中海水域知识卡')
  await expect(mediterraneanCard).toBeVisible()
  await expect(mediterraneanCard.getByText(/不代表领海/)).toHaveCount(0)
  await expect(mediterraneanCard.getByText('代表坐标')).toHaveCount(0)
  await expect(mediterraneanCard.getByText(/资料来源/)).toHaveCount(0)
  await expect(
    page.locator('[data-waterbody-id="mediterranean-sea"]'),
  ).toBeVisible()

  search = await openCountrySearch(page)
  await search.fill('渤海')
  await search.press('Enter')
  await expect(page.getByLabel('渤海水域知识卡')).toBeVisible()
  await expect(page.locator('[data-waterbody-id="bohai-sea"]')).toBeVisible()

  search = await openCountrySearch(page)
  await search.fill('马里亚纳海沟')
  await search.press('Enter')
  await expect(page.getByLabel('马里亚纳海沟水域知识卡')).toBeVisible()
  await expect(mediterraneanCard).toHaveCount(0)

  await page.getByRole('button', { name: '画质：平衡' }).click()
  await expect(page.getByRole('button', { name: '画质：节能' })).toBeVisible()
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone landscape', width: 844, height: 390 },
]) {
  test(`keeps the dragged and zoomed globe view while switching direct selections on ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await page.goto('/')

    const { scene, fallback } = await waitForSceneOrFallback(page)
    if (await fallback.isVisible()) return

    await page.waitForTimeout(1_200)
    const autoRotateButton = page.getByRole('button', { name: /自动旋转：/ })
    if ((await autoRotateButton.getAttribute('aria-pressed')) === 'true') {
      await autoRotateButton.click()
    }
    await expect(autoRotateButton).toHaveAttribute('aria-pressed', 'false')

    const layerControl = await openLayerControl(page)
    await layerControl.getByRole('button', { name: '海洋' }).click()
    await layerControl.getByRole('button', { name: '水域' }).click()
    const layerTrigger = layerControl.getByRole('button', {
      name: /图层，已开启 \d+ 项/,
    })
    await layerTrigger.click()
    await expect(layerTrigger).toHaveAttribute('aria-expanded', 'false')

    const marker = page.getByTestId('world-mini-map-view-marker')
    const initialMarkerTransform = await marker.getAttribute('transform')
    const sceneBox = await scene.boundingBox()
    expect(sceneBox).not.toBeNull()

    await page.mouse.move(
      sceneBox!.x + sceneBox!.width * 0.52,
      sceneBox!.y + sceneBox!.height * 0.5,
    )
    await page.mouse.wheel(0, -180)
    await page.mouse.down()
    await page.mouse.move(
      sceneBox!.x + sceneBox!.width * 0.6,
      sceneBox!.y + sceneBox!.height * 0.55,
      { steps: 8 },
    )
    await page.mouse.up()
    await expect(scene).toHaveAttribute('data-controls-interacting', 'false')
    await expect
      .poll(() => marker.getAttribute('transform'))
      .not.toBe(initialMarkerTransform)
    await page.waitForTimeout(4_500)
    await expect
      .poll(() => page.locator('.waterbody-label:not([hidden])').count())
      .toBeGreaterThanOrEqual(3)

    const parseMarkerPosition = (transform: string | null) => {
      const values = transform?.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/)
      if (!values) throw new Error(`Invalid mini-map marker: ${transform}`)
      return { x: Number(values[1]), y: Number(values[2]) }
    }
    const parseLabelPosition = (transform: string) => {
      const values = transform.match(
        /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0(?:px)?\)/,
      )
      if (!values) throw new Error(`Invalid globe label: ${transform}`)
      return { x: Number(values[1]), y: Number(values[2]) }
    }
    const projectionTolerance = 2

    const selectWithoutMovingView = async (excludedId?: string) => {
      const targetId = await page
        .locator('.waterbody-label:not([hidden])')
        .evaluateAll((labels, excluded) => {
          const target = labels.find(
            (label) => label.getAttribute('data-waterbody-id') !== excluded,
          )
          return target?.getAttribute('data-waterbody-id') ?? null
        }, excludedId)
      expect(targetId).not.toBeNull()

      const target = page.locator(
        `.waterbody-label[data-waterbody-id="${targetId}"]`,
      )
      const targetName = (await target.textContent())?.trim()
      const markerPosition = parseMarkerPosition(
        await marker.getAttribute('transform'),
      )
      const witnessPositions = new Map(
        (
          await page.locator('.waterbody-label:not([hidden])').evaluateAll(
            (labels, excluded) =>
              labels
                .filter((label) => {
                  const id = label.getAttribute('data-waterbody-id')
                  return id !== excluded.targetId && id !== excluded.previousId
                })
                .map((label) => ({
                  id: label.getAttribute('data-waterbody-id')!,
                  transform: (label as HTMLElement).style.transform,
                })),
            { targetId, previousId: excludedId },
          )
        ).map(({ id, transform }) => [id, parseLabelPosition(transform)]),
      )
      expect(witnessPositions.size).toBeGreaterThan(0)

      await target.click()

      await expect(target).toHaveClass(/is-selected/)
      await expect(page.getByLabel(`${targetName}水域知识卡`)).toBeVisible()
      await page.waitForTimeout(1_200)
      const nextMarkerPosition = parseMarkerPosition(
        await marker.getAttribute('transform'),
      )
      const nextWitnessPositions = await page
        .locator('.waterbody-label:not([hidden])')
        .evaluateAll((labels) =>
          labels.map((label) => ({
            id: label.getAttribute('data-waterbody-id')!,
            transform: (label as HTMLElement).style.transform,
          })),
        )
      const witnessDeltas = nextWitnessPositions.flatMap(
        ({ id, transform }) => {
          const before = witnessPositions.get(id)
          if (!before) return []
          const after = parseLabelPosition(transform)
          return [
            Math.max(
              Math.abs(after.x - before.x),
              Math.abs(after.y - before.y),
            ),
          ]
        },
      )
      expect(witnessDeltas.length).toBeGreaterThan(0)
      expect(Math.min(...witnessDeltas)).toBeLessThan(projectionTolerance)
      expect(Math.abs(nextMarkerPosition.x - markerPosition.x)).toBeLessThan(
        projectionTolerance,
      )
      expect(Math.abs(nextMarkerPosition.y - markerPosition.y)).toBeLessThan(
        projectionTolerance,
      )
      return targetId!
    }

    const firstId = await selectWithoutMovingView()
    const secondId = await selectWithoutMovingView(firstId)
    expect(secondId).not.toBe(firstId)
    await expect(
      page.locator(`.waterbody-label[data-waterbody-id="${firstId}"]`),
    ).not.toHaveClass(/is-selected/)
  })
}

test('shows the lake layer and opens the Lake Baikal knowledge card', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const lakeToggle = layerControl.getByRole('button', {
    name: '湖泊图层：世界著名淡水与咸水湖泊',
  })
  await expect(lakeToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.waterbody-label.is-lake')).toHaveCount(0)

  const search = await openCountrySearch(page)
  await search.fill('贝加尔湖')
  await search.press('Enter')
  await openLayerControl(page)

  const card = page.getByRole('complementary', {
    name: '贝加尔湖水域知识卡',
  })
  await expect(card).toBeVisible()
  await expect(card.getByText('31,722 km²')).toBeVisible()
  await expect(card.getByText('1,642 m')).toBeVisible()
  await expect(card.getByText(/水位、季节和长期环境变化/)).toHaveCount(0)
  await expect(lakeToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.waterbody-label.is-lake')).toHaveCount(20)
  await expect
    .poll(() => page.locator('.waterbody-label.is-lake:not([hidden])').count())
    .toBeGreaterThan(0)
  await expect(page.locator('[data-waterbody-id="lake-baikal"]')).toBeVisible()

  await lakeToggle.focus()
  await expect(lakeToggle).toBeFocused()
  await lakeToggle.press('Enter')
  await expect(lakeToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.waterbody-label.is-lake')).toHaveCount(0)
  await expect(card).toBeVisible()

  await lakeToggle.press('Enter')
  await expect(lakeToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.waterbody-label.is-lake')).toHaveCount(20)
  await expect(page.locator('[data-waterbody-id="lake-baikal"]')).toBeVisible()

  await expect(
    card.getByRole('button', { name: '关闭水域知识卡' }),
  ).toHaveCount(0)
  await expect(card).toBeVisible()
  await openLayerControl(page)
  await expect(lakeToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.waterbody-label.is-lake')).toHaveCount(20)
  await expect(page.getByRole('button', { name: '自动旋转：关' })).toBeVisible()

  for (const lake of [
    { id: 'qinghai-lake', name: '青海湖' },
    { id: 'dead-sea', name: '死海' },
    { id: 'tonle-sap', name: '洞里萨湖' },
  ]) {
    await selectPlace(page, lake.name)

    const lakeCard = page.getByRole('complementary', {
      name: `${lake.name}水域知识卡`,
    })
    const lakeLabel = page.locator(
      `[data-waterbody-id="${lake.id}"].waterbody-label.is-lake`,
    )
    await expect(lakeCard).toBeVisible()
    await expect(lakeLabel).toBeVisible()
    await expect(lakeLabel).toHaveClass(/is-selected/)
    const leader = await lakeLabel.evaluate((element) => {
      const labelStyle = getComputedStyle(element)
      const leaderStyle = getComputedStyle(element, '::after')
      return {
        length: Number.parseFloat(
          labelStyle.getPropertyValue('--lake-label-leader-length'),
        ),
        width: Number.parseFloat(leaderStyle.width),
        content: leaderStyle.content,
      }
    })
    expect(leader.length).toBeGreaterThan(10)
    expect(leader.width).toBeGreaterThan(10)
    expect(leader.content).not.toBe('none')

    await expect(
      lakeCard.getByRole('button', { name: '关闭水域知识卡' }),
    ).toHaveCount(0)
    await expect(lakeCard).toBeVisible()
  }
})

test('shows river and canal paths and keeps linear feature selection exclusive', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  await layerControl
    .getByRole('button', {
      name: '河流图层：世界重要河流与人工运河',
    })
    .click()
  await expect
    .poll(() => page.locator('[data-linear-feature-id]:not([hidden])').count())
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      page.locator('.linear-feature-label.is-river:not([hidden])').count(),
    )
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      page.locator('.linear-feature-label.is-canal:not([hidden])').count(),
    )
    .toBeGreaterThan(0)

  let search = await openCountrySearch(page)
  await search.fill('长江')
  await search.press('Enter')
  const riverCard = page.getByLabel('长江知识卡')
  await expect(riverCard).toBeVisible()
  await expect(riverCard.getByText(/资料来源/)).toHaveCount(0)
  await expect(
    riverCard.getByText('青藏高原唐古拉山脉', { exact: true }),
  ).toBeVisible()
  await expect(
    page.locator(
      '[data-linear-feature-id="yangtze-system"].linear-feature-label',
    ),
  ).toBeVisible()
  await expectSelectedLinearFeatureRoute(page, 'yangtze-system', '长江')

  search = await openCountrySearch(page)
  await search.fill('苏伊士运河')
  await search.press('Enter')
  const canalCard = page.getByLabel('苏伊士运河知识卡')
  await expect(canalCard).toBeVisible()
  await expect(canalCard.getByText('地中海', { exact: true })).toBeVisible()
  await expect(riverCard).toHaveCount(0)
  await expectSelectedLinearFeatureRoute(page, 'suez-canal', '苏伊士运河')

  search = await openCountrySearch(page)
  await search.fill('巴拿马运河')
  await search.press('Enter')
  await expect(page.getByLabel('巴拿马运河知识卡')).toBeVisible()
  await expectSelectedLinearFeatureRoute(page, 'panama-canal', '巴拿马运河')

  search = await openCountrySearch(page)
  await search.fill('科林斯运河')
  await search.press('Enter')
  const corinthCard = page.getByLabel('科林斯运河知识卡')
  await expect(corinthCard).toBeVisible()
  await expectSelectedLinearFeatureRoute(page, 'corinth-canal', '科林斯运河')

  await expect(
    corinthCard.getByRole('button', { name: '关闭运河知识卡' }),
  ).toHaveCount(0)
  await expect(
    page.getByTestId('selected-linear-feature-overlay'),
  ).toBeVisible()
})

test('shows mountain ridges, highest peaks, and replaces global selection', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const mountainToggle = layerControl.getByRole('button', {
    name: '山脉图层：世界著名山脉与最高峰',
  })
  await mountainToggle.click()
  await expect(mountainToggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.locator('.mountain-range-label:not([hidden])').count())
    .toBeGreaterThan(0)

  await selectPlace(page, '珠穆朗玛峰')
  await openLayerControl(page)
  const himalayaCard = page.getByRole('complementary', {
    name: '喜马拉雅山脉知识卡',
  })
  await expect(himalayaCard).toBeVisible()
  await expect(himalayaCard.getByText(/资料来源/)).toHaveCount(0)
  await expect(
    himalayaCard.getByText('珠穆朗玛峰', { exact: true }),
  ).toBeVisible()
  await expectSelectedMountainRoute(page, 'himalayas', '喜马拉雅山脉')

  await mountainToggle.click()
  await expect(mountainToggle).toHaveAttribute('aria-pressed', 'false')
  await expectSelectedMountainRoute(page, 'himalayas', '喜马拉雅山脉')

  await selectPlace(page, '安第斯山脉')
  await expect(
    page.getByRole('complementary', { name: '安第斯山脉知识卡' }),
  ).toBeVisible()
  await expect(himalayaCard).toHaveCount(0)
  await expectSelectedMountainRoute(page, 'andes', '安第斯山脉')
  await page.getByRole('button', { name: '画质：平衡' }).click()
  await expect(page.getByRole('button', { name: '画质：节能' })).toBeVisible()
  await expect(page.getByTestId('selected-mountain-overlay')).toHaveAttribute(
    'data-mountain-detail',
    'high',
  )

  await selectPlace(page, '长江')
  await expect(page.getByLabel('长江知识卡')).toBeVisible()
  await expect(page.getByTestId('selected-mountain-overlay')).toHaveCount(0)
  await expect(page.getByTestId('selected-mountain-peak')).toHaveCount(0)
})

test('shows desert regions only while the layer is active', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const desertToggle = layerControl.getByRole('button', {
    name: '沙漠图层：世界主要沙漠与荒漠景观',
  })
  await expect(desertToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.desert-label')).toHaveCount(0)

  await desertToggle.click()
  await expect(desertToggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.locator('.desert-label:not([hidden])').count())
    .toBeGreaterThan(0)
  await desertToggle.click()
  await expect(desertToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.desert-label')).toHaveCount(0)

  await selectPlace(page, '撒哈拉')
  await openLayerControl(page)
  const saharaCard = page.getByRole('complementary', {
    name: '撒哈拉沙漠知识卡',
  })
  await expect(saharaCard).toBeVisible()
  await expect(saharaCard.getByText(/9,200,000 km²/)).toBeVisible()
  await expect(saharaCard.getByText(/不是生态分区/)).toHaveCount(0)
  await expect(saharaCard.getByText('代表坐标')).toHaveCount(0)
  await expect(saharaCard.getByText(/资料来源/)).toHaveCount(0)
  await expect(desertToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-desert-id="sahara"]')).toBeVisible()

  await desertToggle.click()
  await expect(desertToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(saharaCard).toBeVisible()
  await expect(page.locator('.desert-label')).toHaveCount(0)

  await selectPlace(page, '戈壁')
  await openLayerControl(page)
  await expect(desertToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('complementary', { name: '戈壁沙漠知识卡' }),
  ).toBeVisible()
  await expect(saharaCard).toHaveCount(0)
  await page.getByRole('button', { name: '画质：平衡' }).click()
  await expect(page.getByRole('button', { name: '画质：节能' })).toBeVisible()
  await expect(page.locator('[data-desert-id="gobi"]')).toBeVisible()
})

test('shows landmark points, searches the Great Wall, and keeps its card after hiding the layer', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const landmarkToggle = layerControl.getByRole('button', {
    name: '名胜古迹图层：世界著名文化与历史遗产',
  })
  await expect(landmarkToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.landmark-label')).toHaveCount(0)

  await landmarkToggle.focus()
  await expect(landmarkToggle).toBeFocused()
  await landmarkToggle.press('Enter')
  await expect(landmarkToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.landmark-label')).toHaveCount(30)
  await expect
    .poll(() => page.locator('.landmark-label:not([hidden])').count())
    .toBeGreaterThan(0)

  const search = await openCountrySearch(page)
  await search.fill('长城')
  await search.press('Enter')
  await openLayerControl(page)

  const card = page.getByRole('complementary', { name: '长城古迹知识卡' })
  await expect(card).toBeVisible()
  await expect(card.getByText('公元前7世纪至明代')).toBeVisible()
  await expect(card.getByText(/资料来源/)).toHaveCount(0)
  await expect(page.locator('[data-landmark-id="great-wall"]')).toBeVisible()

  await page.getByRole('button', { name: '画质：平衡' }).click()
  await expect(page.getByRole('button', { name: '画质：节能' })).toBeVisible()
  expect(
    await page.locator('.landmark-label:not([hidden])').count(),
  ).toBeLessThanOrEqual(16)
  await expect(page.locator('[data-landmark-id="great-wall"]')).toBeVisible()

  await openLayerControl(page)
  await landmarkToggle.click()
  await expect(landmarkToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.landmark-label')).toHaveCount(0)
  await expect(card).toBeVisible()

  await expect(
    card.getByRole('button', { name: '关闭长城古迹知识卡' }),
  ).toHaveCount(0)
  await openLayerControl(page)
  await expect(landmarkToggle).toHaveAttribute('aria-pressed', 'false')

  const reopenedSearch = await openCountrySearch(page)
  await reopenedSearch.fill('长城')
  await reopenedSearch.press('Enter')
  await expect(card).toBeVisible()
  await openLayerControl(page)
  await expect(landmarkToggle).toHaveAttribute('aria-pressed', 'true')

  await card.getByRole('button', { name: '探索中国' }).click()
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  await expect(card).toHaveCount(0)
})

test('shows synchronized geography reference lines and opens curriculum knowledge', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const toggle = layerControl.getByRole('button', {
    name: '经纬图层：经度基准、半球界线、纬度分区线与五带分界线',
  })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-reference-line-id]')).toHaveCount(0)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const card = page.getByRole('complementary', { name: '地球经纬线知识卡' })
  await expect(card).toBeVisible()
  await expect(card.getByRole('heading', { name: '地球经纬线' })).toBeVisible()
  await expect(card.getByText('当前视角判读')).toBeVisible()
  const categories = card.getByLabel('地球经纬线分类')
  await expect(categories.getByRole('heading', { level: 3 })).toHaveCount(4)
  await expect(
    card.getByLabel('经度基准经纬线').getByRole('button'),
  ).toHaveCount(2)
  await expect(
    card.getByLabel('半球界线经纬线').getByRole('button'),
  ).toHaveCount(3)
  await expect(
    card.getByLabel('纬度分区线经纬线').getByRole('button'),
  ).toHaveCount(4)
  await expect(
    card.getByLabel('五带分界线经纬线').getByRole('button'),
  ).toHaveCount(4)
  await expect(categories.getByRole('button')).toHaveCount(13)
  await expect(card.getByText(/条重点线/)).toHaveCount(0)
  await expect(card.getByText(/用纬线和经线为地球表面建立坐标/)).toHaveCount(0)
  await expect(
    page.locator('.world-mini-map-geography-layer line'),
  ).toHaveCount(13)
  await expect(page.locator('.geography-reference-label')).toHaveCount(13)
  await expect
    .poll(() =>
      page.locator('.geography-reference-label:not([hidden])').count(),
    )
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      page.locator('.geography-reference-label:not([hidden])').count(),
    )
    .toBeLessThan(13)

  const spatialTypography = await page.evaluate(() => {
    const globeLabel = document.querySelector(
      '.geography-reference-label:not([hidden])',
    )
    const diagramLabel = document.querySelector(
      '.geography-reference-diagram text',
    )
    if (!globeLabel || !diagramLabel) {
      throw new Error('Missing geography spatial label')
    }
    return {
      diagramLabel: Number.parseFloat(getComputedStyle(diagramLabel).fontSize),
      globeLabel: Number.parseFloat(getComputedStyle(globeLabel).fontSize),
    }
  })
  expect(spatialTypography.globeLabel).toBeGreaterThanOrEqual(10)
  expect(spatialTypography.globeLabel).toBeLessThan(11)
  expect(spatialTypography.diagramLabel).toBe(7)

  const cancerLabel = page.locator(
    '.geography-reference-label[data-reference-line-id="tropic-of-cancer"]',
  )
  await expect(cancerLabel).toBeVisible()
  await cancerLabel.click()
  await expect(card.getByRole('heading', { name: '北回归线' })).toBeVisible()
  await expect(card.getByText(/热带与北温带的分界线/)).toBeVisible()
  await expect(card.getByText('23.5°N', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: /南回归线/ })).toBeVisible()
  await expect(cancerLabel).toHaveClass(/is-selected/)
  await expect(cancerLabel).toBeVisible()

  await card.getByRole('button', { name: /南回归线/ }).click()
  await expect(card.getByRole('heading', { name: '南回归线' })).toBeVisible()
  await expect(
    page.locator(
      '.geography-reference-label[data-reference-line-id="tropic-of-capricorn"]',
    ),
  ).toHaveClass(/is-selected/)

  await card.getByRole('button', { name: '返回地球经纬线' }).click()
  await expect(card.getByRole('heading', { name: '地球经纬线' })).toBeVisible()
  await expect(card.getByLabel('五带分界线经纬线')).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(
    page.locator('.geography-reference-label.is-selected'),
  ).toHaveCount(0)

  for (const viewport of [
    { width: 1194, height: 834 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(card).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    const cardBox = await card.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.x).toBeGreaterThanOrEqual(0)
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width + 1)
  }

  await page.setViewportSize({ width: 1280, height: 720 })

  await openLayerControl(page)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(card).toBeVisible()
  await expect(page.locator('.world-mini-map-geography-layer')).toHaveCount(0)
  await expect(page.locator('.geography-reference-label')).toHaveCount(0)

  const search = await openCountrySearch(page)
  await search.fill('东西半球')
  await expect(page.getByText('地理知识', { exact: true })).toBeVisible()
  await search.press('Enter')
  await openLayerControl(page)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('heading', { name: '地球经纬线' })).toBeVisible()
  await expect(card.getByLabel('半球界线经纬线')).toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('renders and classifies the synchronized world climate layer', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  await openLayerControl(page)
  const toggle = page.getByRole('button', {
    name: '世界气候类型教学图层',
  })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const climateCountry = page
    .locator('.world-mini-map-countries.is-climate-visible path')
    .first()
  await expect(climateCountry).toBeVisible()
  await expect
    .poll(async () =>
      climateCountry.evaluate((path) =>
        Number.parseFloat(
          getComputedStyle(path).fill.match(/[\d.]+(?=\))/)?.[0] ?? '1',
        ),
      ),
    )
    .toBeLessThan(0.2)

  const card = page.getByRole('complementary', {
    name: '世界气候类型知识卡',
  })
  await expect(card).toBeVisible()
  await expect(card.getByLabel('13类世界气候图例')).toBeVisible()
  const climateImage = page.getByTestId('world-mini-map-climate')
  const scene = page.getByTestId('globe-scene')
  await expect(climateImage).toHaveAttribute(
    'href',
    '/climate/climate-types-2048-v2.png',
  )
  await expect(scene).not.toHaveAttribute('data-climate-highlight-id')
  await expect(page.getByTestId('world-mini-map-climate-boundary')).toHaveCount(
    0,
  )

  const map = page.getByTestId('world-mini-map')
  const mapBox = await map.boundingBox()
  expect(mapBox).not.toBeNull()
  await page.mouse.click(
    mapBox!.x + mapBox!.width * ((116.4 + 180) / 360),
    mapBox!.y + mapBox!.height * ((90 - 39.9) / 180),
  )
  await expect(
    card.getByRole('heading', { name: '温带季风气候' }),
  ).toBeVisible()
  await expect(card.locator('.climate-current-reading')).toContainText(
    /\d+\.\d°N · \d+\.\d°E/,
  )
  await expect(page.getByTestId('world-mini-map-climate-marker')).toBeVisible()
  await expect(climateImage).toHaveAttribute(
    'href',
    '/climate/highlights-v2/balanced/temperate-monsoon.png',
  )
  await expect(scene).toHaveAttribute(
    'data-climate-highlight-id',
    'temperate-monsoon',
  )
  const climateBoundary = page.getByTestId('world-mini-map-climate-boundary')
  await expect(climateBoundary).toHaveAttribute(
    'href',
    '/climate/highlight-boundaries/balanced/temperate-monsoon.png',
  )
  await expect(climateBoundary).toHaveCSS('filter', /drop-shadow/)
  await expect(scene).toHaveAttribute(
    'data-climate-boundary-id',
    'temperate-monsoon',
  )

  await page.getByRole('button', { name: '画质：平衡' }).click()
  await expect(page.getByRole('button', { name: '画质：节能' })).toBeVisible()
  await expect(climateImage).toHaveAttribute(
    'href',
    '/climate/highlights-v2/low/temperate-monsoon.png',
  )
  await expect(climateBoundary).toHaveAttribute(
    'href',
    '/climate/highlight-boundaries/low/temperate-monsoon.png',
  )

  await card.getByRole('button', { name: '查看13类气候图例' }).click()
  await expect(climateImage).toHaveAttribute(
    'href',
    '/climate/climate-types-1024-v2.png',
  )
  await expect(scene).not.toHaveAttribute('data-climate-highlight-id')
  await expect(climateBoundary).toHaveCount(0)
  await expect(scene).not.toHaveAttribute('data-climate-boundary-id')

  await card.getByRole('button', { name: '热带雨林气候' }).click()
  await expect(climateImage).toHaveAttribute(
    'href',
    '/climate/highlights-v2/low/tropical-rainforest.png',
  )
  await expect(scene).toHaveAttribute(
    'data-climate-highlight-id',
    'tropical-rainforest',
  )
  await expect(climateBoundary).toHaveAttribute(
    'href',
    '/climate/highlight-boundaries/low/tropical-rainforest.png',
  )

  await openLayerControl(page)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(card).toBeVisible()
  await expect(scene).not.toHaveAttribute('data-climate-highlight-id')
  await expect(page.getByTestId('world-mini-map-climate-boundary')).toHaveCount(
    0,
  )
  await expect(scene).not.toHaveAttribute('data-climate-boundary-id')

  const search = await openCountrySearch(page)
  await search.fill('地中海气候')
  await expect(page.getByText('气候知识', { exact: true })).toBeVisible()
  await search.press('Enter')
  await openLayerControl(page)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('heading', { name: '地中海气候' })).toBeVisible()
  await expect(climateImage).toHaveAttribute(
    'href',
    '/climate/highlights-v2/low/mediterranean.png',
  )
  await expect(scene).toHaveAttribute(
    'data-climate-highlight-id',
    'mediterranean',
  )
  await expect(climateBoundary).toHaveAttribute(
    'href',
    '/climate/highlight-boundaries/low/mediterranean.png',
  )
  await expect(scene).toHaveAttribute(
    'data-climate-boundary-id',
    'mediterranean',
  )
})

for (const viewport of [
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'iPad landscape', width: 1194, height: 834 },
]) {
  test(`keeps geography learning controls usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        configurable: true,
        value: 5,
      })
      Object.defineProperty(navigator, 'platform', {
        configurable: true,
        value: 'MacIntel',
      })
    })
    await page.setViewportSize(viewport)
    await page.goto('/')

    const { fallback } = await waitForSceneOrFallback(page)
    if (await fallback.isVisible()) return

    await expectLayerPanelGrouped(page)
    const toggle = page.getByRole('button', {
      name: '经纬图层：经度基准、半球界线、纬度分区线与五带分界线',
    })
    await expect(toggle).toBeVisible()
    await toggle.click()

    const card = page.getByRole('complementary', {
      name: '地球经纬线知识卡',
    })
    await expect(card).toBeVisible()
    await waitForKnowledgeCardSettled(card)
    await expect(page.getByLabel('2D定位图当前中心判读')).toBeVisible()
    const cardBox = await card.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.x).toBeGreaterThanOrEqual(0)
    expect(cardBox!.y).toBeGreaterThanOrEqual(0)
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )

    await openLayerControl(page)
    await page.getByRole('button', { name: '世界气候类型教学图层' }).click()
    const climateCard = page.getByRole('complementary', {
      name: '世界气候类型知识卡',
    })
    await expect(climateCard).toBeVisible()
    const climateCardBox = await climateCard.boundingBox()
    expect(climateCardBox).not.toBeNull()
    expect(climateCardBox!.x).toBeGreaterThanOrEqual(0)
    expect(climateCardBox!.y).toBeGreaterThanOrEqual(0)
    expect(climateCardBox!.x + climateCardBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    )
    expect(climateCardBox!.y + climateCardBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    )
  })
}

test('keeps geographic paths stable and suppresses hover while dragging', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { scene, fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  await page.getByRole('button', { name: '自动旋转：开' }).click()
  await expect(page.getByRole('button', { name: '自动旋转：关' })).toBeVisible()

  const layerControl = await openLayerControl(page)
  const riverToggle = layerControl.getByRole('button', {
    name: '河流图层：世界重要河流与人工运河',
  })
  const mountainToggle = layerControl.getByRole('button', {
    name: '山脉图层：世界著名山脉与最高峰',
  })
  await riverToggle.click()
  await mountainToggle.click()

  const riverLabel = page
    .locator('.linear-feature-label.is-river:visible')
    .first()
  await expect(riverLabel).toBeVisible()
  await riverLabel.hover()
  await expect(page.getByRole('tooltip')).toBeVisible()

  const canvasBox = await scene.locator('canvas').boundingBox()
  expect(canvasBox).not.toBeNull()
  await page.mouse.move(
    canvasBox!.x + canvasBox!.width * 0.82,
    canvasBox!.y + canvasBox!.height * 0.74,
  )
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.mouse.down()
  await page.mouse.move(
    canvasBox!.x + canvasBox!.width * 0.76,
    canvasBox!.y + canvasBox!.height * 0.7,
    { steps: 2 },
  )
  await expect(scene).toHaveAttribute('data-controls-interacting', 'true')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.mouse.move(
    canvasBox!.x + canvasBox!.width * 0.46,
    canvasBox!.y + canvasBox!.height * 0.52,
    { steps: 12 },
  )
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.mouse.up()

  await openLayerControl(page)
  await expect(riverToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(mountainToggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.locator('.linear-feature-label:not([hidden])').count())
    .toBeGreaterThan(0)
  await expect
    .poll(() => page.locator('.mountain-range-label:not([hidden])').count())
    .toBeGreaterThan(0)

  const restoredRiverLabel = page
    .locator('.linear-feature-label.is-river:visible')
    .first()
  await restoredRiverLabel.dispatchEvent('pointerover')
  await expect(page.getByRole('tooltip')).toBeVisible()
})

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'phone landscape', width: 844, height: 390, touch: true },
  { name: 'iPad landscape', width: 1194, height: 834, touch: true },
]) {
  test(`keeps the selected canal route visible on ${viewport.name}`, async ({
    page,
  }) => {
    if (viewport.touch) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'maxTouchPoints', {
          configurable: true,
          value: 5,
        })
        Object.defineProperty(navigator, 'platform', {
          configurable: true,
          value: 'MacIntel',
        })
      })
    }
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    await page.goto('/')

    const { fallback } = await waitForSceneOrFallback(page)
    if (await fallback.isVisible()) return

    await expectLayerPanelGrouped(page)

    await selectPlace(page, '科林斯运河')
    await expect(page.getByLabel('科林斯运河知识卡')).toBeVisible()
    await expectSelectedLinearFeatureRoute(page, 'corinth-canal', '科林斯运河')

    await selectPlace(page, '阿尔卑斯山脉')
    await expect(
      page.getByRole('complementary', { name: '阿尔卑斯山脉知识卡' }),
    ).toBeVisible()
    await expectSelectedMountainRoute(page, 'alps', '阿尔卑斯山脉')
    await expectLayerPanelGrouped(page)
  })
}

test('keeps the selected canal enhancement visible in low quality mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  await page.getByRole('button', { name: '画质：平衡' }).click()
  await expect(page.getByRole('button', { name: '画质：节能' })).toBeVisible()
  await selectPlace(page, '苏伊士运河')
  await expectSelectedLinearFeatureRoute(page, 'suez-canal', '苏伊士运河')
})

test('keeps city-layer capital labels synchronized during automatic rotation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  await openLayerControl(page)
  await page.getByRole('button', { name: '城市' }).click()
  const marker = page.getByTestId('world-mini-map-view-marker')
  const labelLayer = page.locator('.globe-city-labels')
  await expect
    .poll(() => labelLayer.locator('.city-label:not([hidden])').count())
    .toBeGreaterThan(0)

  const firstTransform = await marker.getAttribute('transform')
  await expect
    .poll(() => marker.getAttribute('transform'), { timeout: 6_000 })
    .not.toBe(firstTransform)

  const snapshots = await labelLayer
    .locator('.city-label')
    .evaluateAll((labels) =>
      Object.fromEntries(
        labels
          .filter((label) => !(label as HTMLElement).hidden)
          .map((label) => [
            (label as HTMLElement).dataset.cityId ?? '',
            (label as HTMLElement).style.transform,
          ]),
      ),
    )

  await expect
    .poll(
      async () => {
        const current = await labelLayer
          .locator('.city-label')
          .evaluateAll((labels) =>
            Object.fromEntries(
              labels
                .filter((label) => !(label as HTMLElement).hidden)
                .map((label) => [
                  (label as HTMLElement).dataset.cityId ?? '',
                  (label as HTMLElement).style.transform,
                ]),
            ),
          )
        return Object.entries(snapshots).some(
          ([cityId, transform]) =>
            current[cityId] !== undefined && current[cityId] !== transform,
        )
      },
      { timeout: 6_000 },
    )
    .toBe(true)
})

test('keeps the full 2D map visible in touch landscape', async ({ page }) => {
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const toggle = page.getByRole('button', { name: '定位图' })
  const map = page.getByTestId('world-mini-map')
  await expect(toggle).toBeHidden()
  await expect(map).toBeVisible()

  const headerTypography = await page.evaluate(() => {
    const header = document.querySelector('.world-mini-map-header')
    const label = header?.querySelector('span')
    const output = header?.querySelector('output')
    if (!header || !label || !output) {
      throw new Error('Missing world mini-map header typography')
    }
    const headerBox = header.getBoundingClientRect()
    const labelStyle = getComputedStyle(label)
    const outputStyle = getComputedStyle(output)
    return {
      height: headerBox.height,
      labelFontSize: labelStyle.fontSize,
      labelFontWeight: labelStyle.fontWeight,
      outputFontSize: outputStyle.fontSize,
      outputFontWeight: outputStyle.fontWeight,
    }
  })
  expect(headerTypography.height).toBeLessThanOrEqual(38)
  expect(headerTypography.labelFontSize).toBe('10px')
  expect(headerTypography.outputFontSize).toBe('10px')
  expect(headerTypography.labelFontWeight).toBe('400')
  expect(headerTypography.outputFontWeight).toBe('400')

  await map.locator('[data-country-code="CN"]').click()
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  await expect(map).toBeVisible()
})

test('keeps the layer panel inside an iPad landscape safe area', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    })
  })
  await page.setViewportSize({ width: 1194, height: 834 })
  await page.goto('/')

  const { fallback } = await waitForSceneOrFallback(page)
  if (await fallback.isVisible()) return

  const layerControl = await openLayerControl(page)
  const trigger = layerControl.getByRole('button', {
    name: '图层，已开启 0 项',
  })
  const panel = layerControl.getByRole('region', { name: '图层选择' })
  const [triggerBox, panelBox] = await Promise.all([
    trigger.boundingBox(),
    panel.boundingBox(),
  ])
  expect(triggerBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(triggerBox!.x).toBeGreaterThanOrEqual(11)
  expect(triggerBox!.y).toBeGreaterThanOrEqual(11)
  expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(1194 - 11)
  expect(panelBox!.x).toBeGreaterThanOrEqual(58)
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1194 - 11)
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(834 - 11)
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText([
    '标注',
    '地球知识',
    '水域',
    '地貌与文化',
  ])
  await expect(panel.getByRole('button')).toHaveCount(10)
  const minimumTargetHeight = await panel
    .getByRole('button')
    .evaluateAll((buttons) =>
      Math.min(
        ...buttons.map((button) => button.getBoundingClientRect().height),
      ),
    )
  expect(minimumTargetHeight).toBeGreaterThanOrEqual(44)

  await layerControl.getByRole('button', { name: '城市' }).click()
  await expect(layerControl.getByRole('button', { name: '首都' })).toHaveCount(
    0,
  )
  await expect(
    layerControl.getByRole('button', { name: '城市' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('shows the fallback instead of crashing without WebGL', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext.bind(
      document.createElement('canvas'),
    )
    HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
      if (contextId === 'webgl' || contextId === 'webgl2') return null
      return originalGetContext(contextId as '2d')
    }) as typeof HTMLCanvasElement.prototype.getContext
  })

  await page.goto('/')

  await expect(page.getByTestId('webgl-fallback')).toBeVisible()
  await expect(page.getByTestId('globe-scene')).toHaveCount(0)
  await expect(page.getByTestId('world-mini-map')).toBeVisible()
  const search = await openCountrySearch(page)
  await search.fill('中国')
  await search.press('Enter')
  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  const mountainSearch = await openCountrySearch(page)
  await mountainSearch.fill('Everest')
  await mountainSearch.press('Enter')
  await expect(
    page.getByRole('complementary', { name: '喜马拉雅山脉知识卡' }),
  ).toBeVisible()
  const climateSearch = await openCountrySearch(page)
  await climateSearch.fill('世界气候类型')
  await climateSearch.press('Enter')
  await expect(
    page.getByRole('complementary', { name: '世界气候类型知识卡' }),
  ).toBeVisible()
  const fallbackClimateImage = page.getByTestId('world-mini-map-climate')
  await expect(fallbackClimateImage).toHaveAttribute(
    'href',
    '/climate/climate-types-2048-v2.png',
  )
  const climateTypeSearch = await openCountrySearch(page)
  await climateTypeSearch.fill('热带雨林气候')
  await climateTypeSearch.press('Enter')
  await expect(fallbackClimateImage).toHaveAttribute(
    'href',
    '/climate/highlights-v2/balanced/tropical-rainforest.png',
  )
  await expect(
    page.getByTestId('world-mini-map-climate-boundary'),
  ).toHaveAttribute(
    'href',
    '/climate/highlight-boundaries/balanced/tropical-rainforest.png',
  )
  await expect(page.getByRole('region', { name: '地球图层控制' })).toHaveCount(
    0,
  )
})

test('respects the system reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(
    page.getByRole('button', { name: '自动旋转：关' }),
  ).toBeDisabled()
})

test('reloads the core experience while offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: '搜索' })).toBeVisible()
    const scene = page.getByTestId('globe-scene')
    if (await scene.isVisible()) {
      await expect(page.getByTestId('world-mini-map')).toBeVisible()
    }
  } finally {
    await context.setOffline(false)
  }
})

test('searches China and opens the featured knowledge card', async ({
  page,
}) => {
  await page.goto('/')

  const search = await openCountrySearch(page)
  await search.fill('中国')
  await search.press('Enter')

  const card = page.getByLabel('中国国家知识卡')
  await expect(card).toBeVisible()
  await expect(card.getByRole('heading', { name: '中国' })).toBeVisible()
  await expect(card.getByAltText('中国国旗')).toHaveAttribute(
    'src',
    '/flags/cn.svg',
  )
  await card.getByRole('button', { name: '查看中国国旗含义' }).click()
  const flagDialog = page.getByRole('dialog', { name: '中国国旗' })
  await expect(flagDialog).toBeVisible()
  await expect(flagDialog.getByRole('heading', { name: '外观' })).toBeVisible()
  await expect(
    flagDialog.getByRole('heading', { name: '含义', exact: true }),
  ).toBeVisible()
  await flagDialog.getByRole('button', { name: '关闭中国国旗含义' }).click()
  await expect(card.getByText('大熊猫', { exact: true })).toBeVisible()
  await expect(card.getByText('珠穆朗玛峰', { exact: true })).toBeVisible()
  await expect(card.getByText('长城', { exact: true })).toBeVisible()
  await expect(card.getByText('故宫', { exact: true })).toBeVisible()
  await expect(card.getByText('国家名片')).toHaveCount(0)
  await expect(card.getByRole('button', { name: /语言民族/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await card.getByRole('button', { name: /^主要城市/ }).click()
  await expect(card.locator('.knowledge-country-city-row')).toHaveCount(5)
  await expect(card.locator('.knowledge-country-city-row').first()).toHaveText(
    '北京Beijing',
  )
  await expect(card.getByRole('button', { name: /探索城市/ })).toHaveCount(0)
  await expect(card.getByText('人民币 CNY ¥', { exact: true })).toBeVisible()
  await expect(card.getByText('Chinese yuan', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: /国际关系/ }).click()
  await expect(card.getByText('中国香港')).toBeVisible()
  await expect(card.getByText('中国澳门')).toBeVisible()
  await expect(card.getByText('组织', { exact: true })).toBeVisible()
  await expect(card.getByText('联合国安理会常任理事国')).toBeVisible()
  await expect(
    card.getByText('Permanent Members of the United Nations Security Council'),
  ).toHaveCount(0)
  await expect(card.getByText('二十国集团')).toBeVisible()
  await expect(card.getByText('金砖国家')).toBeVisible()
  await expect(card.getByText('上海合作组织')).toBeVisible()
  await expect(card.getByText(/世界贸易组织/)).toHaveCount(0)
  await expect(card.getByText('全球', { exact: true })).toHaveCount(0)
  await expect(card.getByText('功能', { exact: true })).toHaveCount(0)
  const p5Trigger = card.getByRole('button', {
    name: '查看联合国安理会常任理事国详情',
  })
  await p5Trigger.click()
  const organizationDialog = page.getByRole('dialog', {
    name: '联合国安理会常任理事国',
  })
  await expect(organizationDialog).toBeVisible()
  await expect(
    organizationDialog.getByText(
      'Permanent Members of the United Nations Security Council',
    ),
  ).toBeVisible()
  await expect(
    organizationDialog.getByRole('heading', { name: '基本信息' }),
  ).toBeVisible()
  await expect(
    organizationDialog.getByRole('heading', { name: '组织介绍' }),
  ).toBeVisible()
  await expect(
    organizationDialog.getByRole('heading', { name: '主要作用' }),
  ).toBeVisible()
  await expect(
    organizationDialog.locator('.international-affiliation-member-grid li'),
  ).toHaveCount(5)
  await expect(
    organizationDialog.locator('.international-affiliation-member-grid button'),
  ).toHaveCount(0)
  await organizationDialog
    .getByRole('button', { name: '关闭联合国安理会常任理事国详情' })
    .click()
  await expect(p5Trigger).toBeFocused()
  await expect(card.getByRole('button', { name: /国际关系/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(card.getByText(/大熊猫主要生活/)).toHaveCount(0)
})

test('wraps every reviewed signature label without a display limit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 })
  await page.goto('/explore?country=AU')

  const card = page.getByLabel('澳大利亚国家知识卡')
  const labels = card.locator('.knowledge-country-signature-labels li')
  await expect(labels).toHaveText([
    '袋鼠',
    '考拉',
    '鸭嘴兽',
    '大堡礁',
    '悉尼歌剧院',
  ])
  const rows = await labels.evaluateAll(
    (items) =>
      new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)))
        .size,
  )
  expect(rows).toBeGreaterThan(1)
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBe(0)
})

test('resets the globe view to China', async ({ page }) => {
  await page.goto('/')

  const search = await openCountrySearch(page)
  await search.fill('法国')
  await search.press('Enter')
  await expect(page.getByLabel('法国国家知识卡')).toBeVisible()

  await page.getByRole('button', { name: '重置视角' }).click()

  await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
  const resetSearch = await openCountrySearch(page)
  await expect(resetSearch).toHaveValue('')
})

test('searches a microstate without Natural Earth geometry', async ({
  page,
}) => {
  await page.goto('/')

  const search = await openCountrySearch(page)
  await search.fill('Vatican')
  await search.press('Enter')

  const card = page.getByLabel('梵蒂冈国家知识卡')
  await expect(card).toBeVisible()
  await expect(card.getByText('梵蒂冈城国')).toBeVisible()
  await expect(card.getByText('0.44 km²')).toBeVisible()
  await card.getByRole('button', { name: /语言民族/ }).click()
  await expect(card.getByText('拉丁语', { exact: true })).toBeVisible()
  await expect(card.getByText('Latin', { exact: true })).toHaveCount(0)
  await card.getByRole('button', { name: /^主要城市/ }).click()
  await expect(card.locator('.knowledge-country-city-row')).toHaveText(
    '梵蒂冈城Vatican City',
  )
  await expect(card.getByRole('button', { name: /探索城市/ })).toHaveCount(0)
  await expect(card.locator('.knowledge-country-signature-labels')).toHaveCount(
    0,
  )
  await expect(card.getByText('更多内容制作中')).toHaveCount(0)
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'smallest landscape', width: 568, height: 320 },
]) {
  test(`keeps the longest bilingual city row contained on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/explore?country=BN')

    const card = page.getByLabel('文莱国家知识卡')
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /^主要城市/ }).click()

    const row = card.locator('.knowledge-country-city-row')
    const englishName = row.locator('[title="Bandar Seri Begawan"]')
    await expect(row).toHaveCount(1)
    await expect(row).toHaveText('斯里巴加湾市Bandar Seri Begawan')
    await expect(englishName).toHaveCSS('white-space', 'nowrap')
    await expect(card.getByRole('button', { name: /探索城市/ })).toHaveCount(0)
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0)
  })
}

test('selects a sovereign neighbour and opens the new country card', async ({
  page,
}) => {
  await page.goto('/')

  const search = await openCountrySearch(page)
  await search.fill('Vatican')
  await search.press('Enter')
  const vaticanCard = page.getByLabel('梵蒂冈国家知识卡')

  await vaticanCard.getByRole('button', { name: /国际关系/ }).click()
  await vaticanCard.getByRole('button', { name: '探索邻国意大利' }).click()

  const italyCard = page.getByLabel('意大利国家知识卡')
  await expect(italyCard).toBeVisible()
  await expect(
    italyCard.getByRole('heading', { name: '意大利', level: 2, exact: true }),
  ).toBeVisible()
  await expect(italyCard.getByText('意大利共和国')).toBeVisible()
  await expect(
    italyCard.getByRole('button', { name: /语言民族/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  const italySearch = await openCountrySearch(page)
  await expect(italySearch).toHaveValue('')
})

test('opens a complete chapter with the keyboard and resets it on navigation', async ({
  page,
}) => {
  await page.goto('/')

  const search = await openCountrySearch(page)
  await search.fill('CN')
  await search.press('Enter')
  const card = page.getByLabel('中国国家知识卡')

  const citiesChapter = card.getByRole('button', { name: /^主要城市/ })
  await citiesChapter.focus()
  await page.keyboard.press('Enter')
  await expect(citiesChapter).toHaveAttribute('aria-expanded', 'true')
  await expect(card.locator('.knowledge-country-city-row')).toHaveCount(5)
  await expect(card.getByRole('button', { name: /探索城市/ })).toHaveCount(0)
  await expect(
    card.getByRole('button', { name: '探索邻国俄罗斯' }),
  ).toHaveCount(0)
  const relationsChapter = card.getByRole('button', { name: /国际关系/ })
  await relationsChapter.focus()
  await page.keyboard.press('Space')
  await expect(relationsChapter).toHaveAttribute('aria-expanded', 'true')
  await expect(citiesChapter).toHaveAttribute('aria-expanded', 'false')
  await expect(
    card.getByRole('button', { name: '探索邻国俄罗斯' }),
  ).toBeVisible()
  await expect(
    card.getByRole('button', { name: /查看全部主要城市/ }),
  ).toHaveCount(0)
  await expect(
    card.getByRole('button', { name: /查看全部相邻国家/ }),
  ).toHaveCount(0)
  await card.getByRole('button', { name: '探索邻国俄罗斯' }).click()

  const russiaCard = page.getByLabel('俄罗斯国家知识卡')
  await expect(russiaCard).toBeVisible()
  const russiaRelations = russiaCard.getByRole('button', {
    name: /国际关系/,
  })
  await russiaRelations.focus()
  await page.keyboard.press('Space')
  await russiaCard.getByRole('button', { name: '探索邻国中国' }).click()

  const resetCard = page.getByLabel('中国国家知识卡')
  await expect(
    resetCard.getByRole('button', { name: /语言民族/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(
    resetCard.getByRole('button', { name: /^主要城市/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(
    resetCard.getByRole('button', { name: /国际关系/ }),
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(
    resetCard.getByRole('button', { name: '探索城市成都' }),
  ).toHaveCount(0)
  await expect(resetCard.getByText(/资料来源/)).toHaveCount(0)
})

test('uses the mobile bottom sheet for country details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const search = await openCountrySearch(page)
  await search.fill('CN')
  await search.press('Enter')

  const card = page.getByLabel('中国国家知识卡')
  await expect(card).toBeVisible()
  await expect
    .poll(() =>
      card.evaluate((element) =>
        element
          .getAnimations()
          .every((animation) => animation.playState === 'finished'),
      ),
    )
    .toBe(true)
  const box = await card.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeLessThanOrEqual(1)
  expect(box!.width).toBeGreaterThanOrEqual(389)
  expect(box!.y + box!.height).toBeGreaterThanOrEqual(843)
  await expect(
    page.getByRole('button', { name: '关闭国家知识卡' }),
  ).toHaveCount(0)
  await expect(card.getByText('面积')).toBeVisible()
})

test('opens a country card from the offline cache', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    const search = await openCountrySearch(page)
    await search.fill('中国')
    await search.press('Enter')
    await expect(page.getByLabel('中国国家知识卡')).toBeVisible()
    await expect(page.getByAltText('中国国旗')).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
