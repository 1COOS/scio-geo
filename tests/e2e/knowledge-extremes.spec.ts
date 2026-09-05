import { expect, test } from '@playwright/test'

const extremesViewports = [
  { name: '1440 desktop', width: 1440, height: 900 },
  { name: 'iPad landscape', width: 1194, height: 834 },
  { name: 'phone landscape', width: 844, height: 390 },
]

const categoryGeometryCases = [
  {
    category: 'country-scale',
    overlayCount: 4,
    expected: [],
    unexpected: ['mountain', 'desert', 'river', 'waterbody'],
  },
  {
    category: 'mountains-deserts',
    overlayCount: 3,
    expected: ['mountain', 'desert'],
    unexpected: ['river', 'waterbody'],
  },
  {
    category: 'rivers-lakes',
    overlayCount: 3,
    expected: ['river', 'waterbody'],
    unexpected: ['mountain', 'desert'],
  },
  {
    category: 'oceans-depths',
    overlayCount: 2,
    expected: ['waterbody'],
    unexpected: ['mountain', 'desert', 'river'],
  },
] as const

for (const viewport of extremesViewports) {
  test(`uses the two-level world-extremes atlas on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/knowledge/extremes')

    await expect(page).toHaveURL(
      /\/knowledge\/extremes\?category=country-scale$/,
    )
    await expect(
      page.getByRole('heading', { name: '世界之最', level: 1 }),
    ).toHaveClass('sr-only')
    await expect(page.getByLabel('世界之最知识范围')).toHaveCount(0)
    await expect(page.getByRole('tab')).toHaveText([
      '国家尺度',
      '高山荒漠',
      '江河湖泊',
      '海洋深处',
    ])
    const categoryMap = page.getByTestId('world-extremes-category-map')
    await expect(categoryMap).toBeVisible()
    await expect(categoryMap).toHaveAttribute('viewBox', '0 0 720 340')
    await expect(categoryMap.getByRole('button')).toHaveCount(4)
    await expect(categoryMap.locator('text')).toHaveCount(0)
    await expect(
      categoryMap.locator('[data-geometry-kind="surface"]'),
    ).toHaveCount(2)
    await expect(
      categoryMap.locator('[data-geometry-kind="microstate"]'),
    ).toHaveCount(2)
    const metricMenu = page.getByLabel('国家尺度指标')
    await expect(metricMenu.getByRole('link')).toHaveCount(4)
    await expect(metricMenu.locator('a > [aria-hidden="true"]')).toHaveCount(0)
    const colorContract = await page.evaluate(() =>
      [
        'largest-country-area',
        'smallest-country-area',
        'most-populous-country',
        'least-populous-country',
      ].map((metricId) => {
        const card = document.querySelector<HTMLElement>(
          `[data-testid="world-extreme-metric-${metricId}"]`,
        )!
        const visible = document.querySelector<SVGElement>(
          `[data-metric-id="${metricId}"] .world-extremes-category-visible`,
        )!
        return {
          card: getComputedStyle(card)
            .getPropertyValue('--knowledge-earth-line-color')
            .trim(),
          map:
            visible.getAttribute('fill') === 'none'
              ? visible.getAttribute('stroke')
              : visible.getAttribute('fill'),
        }
      }),
    )
    expect(colorContract.every(({ card, map }) => card === map)).toBe(true)
    expect(new Set(colorContract.map(({ card }) => card)).size).toBe(4)
    const vaticanTransforms = await categoryMap
      .locator('[data-entry-id="vatican-city"]')
      .evaluateAll((overlays) =>
        overlays.map((overlay) => overlay.getAttribute('transform')),
      )
    expect(new Set(vaticanTransforms).size).toBe(2)
    await expectNoPageScroll(page)

    const [mapBox, svgBox, cardsBox] = await Promise.all([
      page.locator('.knowledge-earth-map-card').boundingBox(),
      categoryMap.boundingBox(),
      page.getByLabel('国家尺度指标').boundingBox(),
    ])
    expect(mapBox).not.toBeNull()
    expect(svgBox).not.toBeNull()
    expect(cardsBox).not.toBeNull()
    expect(mapBox!.width / mapBox!.height).toBeCloseTo(36 / 17, 1)
    expect(svgBox!.x).toBeCloseTo(mapBox!.x + 1, 0)
    expect(svgBox!.y).toBeCloseTo(mapBox!.y + 1, 0)
    expect(svgBox!.width).toBeCloseTo(mapBox!.width - 2, 0)
    expect(svgBox!.height).toBeCloseTo(mapBox!.height - 2, 0)
    expect(mapBox!.y + mapBox!.height).toBeLessThanOrEqual(cardsBox!.y + 1)

    const champion = page
      .getByTestId('world-extremes-category-map')
      .getByRole('button', { name: '查看面积最大的国家冠军俄罗斯' })
    await champion.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(
      /\/knowledge\/extremes\/metrics\/largest-country-area\?entry=russia$/,
    )
    const detailCard = page.getByRole('complementary', {
      name: '俄罗斯世界之最详情',
    })
    await expect(detailCard).toBeVisible()
    await expect(page.getByLabel('国家尺度指标').getByRole('link')).toHaveCount(
      4,
    )
    await expect(
      page.getByLabel('面积最大的国家前三名').getByRole('link'),
    ).toHaveCount(3)
    await expect(
      page
        .getByLabel('面积最大的国家前三名')
        .locator('a > [aria-hidden="true"]'),
    ).toHaveText(['1', '2', '3'])
    await expectNoPageScroll(page)

    await expect(
      detailCard.getByRole('button', { name: '关闭俄罗斯世界之最详情' }),
    ).toHaveCount(0)
  })
}

for (const geometryCase of categoryGeometryCases) {
  test(`loads only ${geometryCase.category} champion geometry on the overview`, async ({
    page,
  }) => {
    const geometryRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('-geometries')) {
        geometryRequests.push(request.url())
      }
    })
    await page.setViewportSize({ width: 1194, height: 834 })
    await page.goto(`/knowledge/extremes?category=${geometryCase.category}`)
    await expect(
      page
        .getByTestId('world-extremes-category-map')
        .locator('.world-extremes-category-overlays > g'),
    ).toHaveCount(geometryCase.overlayCount)

    for (const expected of geometryCase.expected) {
      expect(
        geometryRequests.some((request) => request.includes(`${expected}-`)),
        expected,
      ).toBe(true)
    }
    for (const unexpected of geometryCase.unexpected) {
      expect(
        geometryRequests.some((request) => request.includes(`${unexpected}-`)),
        unexpected,
      ).toBe(false)
    }
  })
}

test('loads geometry only when the selected extreme metric needs it', async ({
  page,
}) => {
  const geometryRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('-geometries')) {
      geometryRequests.push(request.url())
    }
  })
  await page.setViewportSize({ width: 1194, height: 834 })
  await page.goto('/knowledge/extremes/metrics/highest-peak')
  await expect(page.locator('.world-extremes-map-markers > g')).toHaveCount(3)
  expect(geometryRequests).toEqual([])

  await page.goto(
    '/knowledge/extremes/metrics/longest-continental-mountain-range',
  )
  await expect(page.locator('.world-extremes-map-features path')).toHaveCount(3)
  expect(
    geometryRequests.some((request) => request.includes('mountain-geometries')),
  ).toBe(true)
})

test('keeps metric cards available and retries failed overview geometry', async ({
  page,
}) => {
  let desertFails = true
  await page.route(/desert-geometries-.*\.json/, async (route) => {
    if (desertFails) await route.abort('failed')
    else await route.continue()
  })
  await page.goto('/knowledge/extremes?category=mountains-deserts')

  await expect(page.getByRole('alert')).toContainText('指标卡仍可继续使用')
  await expect(page.getByLabel('高山荒漠指标').getByRole('link')).toHaveCount(3)

  desertFails = false
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(
    page
      .getByTestId('world-extremes-category-map')
      .locator('.world-extremes-category-overlays > g'),
  ).toHaveCount(3)
})

test('keeps compact sources and exact 3D links on the new metric route', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1194, height: 834 })
  await page.goto(
    '/knowledge/extremes/metrics/highest-peak?entry=mount-everest',
  )

  const detailCard = page.getByRole('complementary', {
    name: '珠穆朗玛峰世界之最详情',
  })
  await expect(detailCard).toBeVisible()
  await expect(
    page.locator('.world-extremes-map-markers > g').last(),
  ).toHaveAttribute('data-entry-id', 'mount-everest')
  await detailCard.getByText('资料来源（2）').click()
  await expect(
    detailCard.getByRole('link', {
      name: 'Scio Geo reviewed mountain and highest-peak catalogue',
    }),
  ).toBeVisible()
  await expect(
    detailCard.getByRole('link', { name: /在3D地球上查看/ }),
  ).toHaveAttribute(
    'href',
    '/explore?latitude=27.9881&longitude=86.925&mountainRange=himalayas',
  )
})

test('redirects legacy extreme routes to the two-level hierarchy', async ({
  page,
}) => {
  await page.goto('/knowledge/extremes/highest-peak/mount-everest')
  await expect(page).toHaveURL(
    /\/knowledge\/extremes\/metrics\/highest-peak\?entry=mount-everest$/,
  )
  await page.goto(
    '/knowledge/extremes?category=country-scale&metric=deepest-lake',
  )
  await expect(page).toHaveURL(/\/knowledge\/extremes\/metrics\/deepest-lake$/)
})

async function expectNoPageScroll(page: import('@playwright/test').Page) {
  const scroll = await page.locator('main').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight)
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - innerWidth,
    root: document.documentElement.scrollWidth - innerWidth,
  }))
  expect(overflow.body).toBeLessThanOrEqual(0)
  expect(overflow.root).toBeLessThanOrEqual(0)
}
