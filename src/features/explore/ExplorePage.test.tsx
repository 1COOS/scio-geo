import * as Tooltip from '@radix-ui/react-tooltip'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '../../app/i18n'
import type { GeoPosition } from '../../shared/types/geo'
import { ExplorePage } from './ExplorePage'
import { parseExploreDeepLinkPosition } from './exploreDeepLinks'

const globePropsMock = vi.fn()
const climateRasterMocks = vi.hoisted(() => ({
  classify: vi.fn(),
  display: vi.fn(),
  preload: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../data/climateRaster', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../data/climateRaster')>()
  return {
    ...actual,
    classifyClimatePosition: climateRasterMocks.classify,
    loadClimateDisplayAssets: climateRasterMocks.display,
    preloadClimateRaster: climateRasterMocks.preload,
  }
})

vi.mock('../../scene/GlobeScene', () => ({
  GlobeScene: (props: unknown) => {
    const grouped = props as Record<string, Record<string, unknown>>
    globePropsMock({
      ...grouped.geometry,
      ...grouped.view,
      ...grouped.layers,
      ...grouped.climate,
      ...grouped.selection,
      ...grouped.hover,
      ...grouped.events,
    })
    return <div data-testid="mock-globe-scene">3D globe</div>
  },
}))

const supportsWebGLMock = vi.fn<() => boolean>()

vi.mock('../../shared/lib/webgl', () => ({
  supportsWebGL: () => supportsWebGLMock(),
}))

async function openLayerPanel(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', {
    name: /图层，已开启 \d+ 项/,
  })
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await user.click(trigger)
  }
  return screen.getByRole('region', { name: '图层选择' })
}

function callGlobeEvent(name: string, ...args: unknown[]) {
  act(() => {
    const callback = (
      globePropsMock.mock.lastCall?.[0] as Record<string, unknown>
    )[name]
    if (typeof callback !== 'function') throw new Error(`Missing ${name}`)
    ;(callback as (...values: unknown[]) => void)(...args)
  })
}

describe('ExplorePage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/explore')
    supportsWebGLMock.mockReturnValue(true)
    globePropsMock.mockClear()
    climateRasterMocks.display.mockReset()
    climateRasterMocks.display.mockImplementation(
      (quality: 'balanced' | 'low', climateTypeId: string | null) => {
        const width = quality === 'balanced' ? 2048 : 1024
        const height = quality === 'balanced' ? 1024 : 512
        const raster = {
          url: climateTypeId
            ? `/climate/highlights-v2/${quality}/${climateTypeId}.png`
            : `/climate/climate-types-${width}.png`,
          width,
          height,
          bytes: 1,
          sha256: '0'.repeat(64),
        }
        return Promise.resolve({
          raster,
          boundary: climateTypeId
            ? {
                ...raster,
                url: `/climate/highlight-boundaries/${quality}/${climateTypeId}.png`,
              }
            : null,
        })
      },
    )
    climateRasterMocks.preload.mockClear()
    climateRasterMocks.classify.mockReset()
    climateRasterMocks.classify.mockResolvedValue({
      position: { latitude: 39.9, longitude: 116.4 },
      climateTypeId: 'temperate-monsoon',
      period: '1991–2020',
    })
  })

  it('opens a validated geography deep link and focuses its reference line', async () => {
    window.history.replaceState(
      {},
      '',
      '/explore?geography=earth-zones&line=tropic-of-cancer',
    )
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    const card = await screen.findByLabelText('地球经纬线知识卡')
    expect(
      within(card).getByRole('heading', { name: '北回归线' }),
    ).toBeInTheDocument()
    expect(within(card).getByText('纬线')).toBeInTheDocument()
    expect(within(card).getByText('23.5°N')).toBeInTheDocument()
    expect(
      within(card).getByRole('button', { name: /南回归线/ }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        showGeographyLearningLayer: true,
        selectedGeographyTopicId: 'earth-zones',
        selectedReferenceLineId: 'tropic-of-cancer',
        cameraTarget: {
          position: { latitude: 23.5, longitude: 105 },
          distance: 350,
        },
      }),
    )
  })

  it('opens a territory deep link without selecting it as a country', async () => {
    window.history.replaceState({}, '', '/explore?territory=greenland')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByLabelText('格陵兰地区知识卡')).toBeVisible()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        selectedCountryCode: null,
        selectedTerritoryId: 'greenland',
        cameraTarget: {
          position: { latitude: 72, longitude: -41 },
          distance: 245,
        },
      }),
    )
  })

  it('keeps a valid geography topic but drops an invalid or mismatched line', async () => {
    window.history.replaceState(
      {},
      '',
      '/explore?geography=grid-reading&line=equator',
    )
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    const card = await screen.findByLabelText('地球经纬线知识卡')
    expect(
      within(card).getByRole('heading', { name: '地球经纬线' }),
    ).toBeInTheDocument()
    const categories = within(card).getByLabelText('地球经纬线分类')
    expect(
      within(categories).getAllByRole('heading', { level: 3 }),
    ).toHaveLength(4)
    expect(within(card).getByLabelText('经度基准经纬线')).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(within(categories).getAllByRole('button')).toHaveLength(13)
    expect(within(card).queryByText(/条重点线/)).toBeNull()
    expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
      showGeographyLearningLayer: true,
      selectedGeographyTopicId: 'grid-reading',
      selectedReferenceLineId: null,
    })
  })

  it('ignores an invalid geography deep link', async () => {
    window.history.replaceState(
      {},
      '',
      '/explore?geography=unknown&line=equator',
    )
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByTestId('mock-globe-scene')).toBeInTheDocument()
    const guide = screen.getByLabelText('3D 地球使用说明')
    expect(
      within(guide).getByRole('heading', { name: '转动地球，发现世界' }),
    ).toBeInTheDocument()
    expect(within(guide).getByText(/滚轮或双指开合/)).toBeInTheDocument()
    expect(
      within(guide).getByText(/主导航搜索、图层和定位图/),
    ).toBeInTheDocument()
    expect(within(guide).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('地球经纬线知识卡')).not.toBeInTheDocument()
    expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
      showGeographyLearningLayer: false,
      selectedGeographyTopicId: null,
      selectedReferenceLineId: null,
    })
  })

  it('opens landmark and climate overview deep links from standalone search', async () => {
    window.history.replaceState({}, '', '/explore?landmark=great-wall')
    const landmarkView = render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByLabelText('长城古迹知识卡')).toBeVisible()
    expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
      showLandmarkLayer: true,
      selectedLandmarkId: 'great-wall',
    })

    landmarkView.unmount()
    window.history.replaceState({}, '', '/explore?climate=world-climate-types')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByLabelText('世界气候类型知识卡')).toBeVisible()
    expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
      showClimateLayer: true,
      selectedClimateTypeId: null,
    })
  })

  it('keeps the selected card while the mini map moves to a coordinate', async () => {
    window.history.replaceState({}, '', '/explore?country=CN')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    await screen.findByLabelText('中国国家知识卡')
    const map = screen.getByTestId('world-mini-map')
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 360,
      bottom: 180,
      left: 0,
      width: 360,
      height: 180,
      toJSON: () => ({}),
    })

    fireEvent.click(map, { clientX: 1, clientY: 90 })

    expect(screen.getByLabelText('中国国家知识卡')).toBeInTheDocument()
    expect(screen.queryByLabelText('3D 地球使用说明')).not.toBeInTheDocument()
    expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
      selectedCountryCode: 'CN',
    })
  })

  it('keeps reset behavior focused on China rather than restoring the guide', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    await user.click(screen.getByRole('button', { name: '重置视角' }))

    expect(screen.getByLabelText('中国国家知识卡')).toBeInTheDocument()
    expect(screen.queryByLabelText('3D 地球使用说明')).not.toBeInTheDocument()
  })

  it('opens waterbody and linear-feature deep links with their layers and camera targets', async () => {
    window.history.replaceState({}, '', '/explore?waterbody=lake-baikal')
    const { unmount } = render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByLabelText('贝加尔湖水域知识卡')).toBeVisible()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        showLakeLayer: true,
        selectedWaterbodyId: 'lake-baikal',
        selectedLinearFeatureId: null,
        cameraTarget: {
          position: { latitude: 53.5, longitude: 108.1 },
          distance: 205,
        },
      }),
    )

    unmount()
    window.history.replaceState({}, '', '/explore?linearFeature=amazon-system')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    expect(await screen.findByLabelText('亚马孙河知识卡')).toBeVisible()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        showRiverAndCanalLayer: true,
        selectedLinearFeatureId: 'amazon-system',
        selectedWaterbodyId: null,
      }),
    )
  })

  it('opens mountain and desert deep links and lets record coordinates override the camera target', async () => {
    window.history.replaceState(
      {},
      '',
      '/explore?mountainRange=himalayas&latitude=27.9881&longitude=86.925',
    )
    const { unmount } = render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByLabelText('喜马拉雅山脉知识卡')).toBeVisible()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        showMountainLayer: true,
        selectedMountainRangeId: 'himalayas',
        cameraTarget: {
          position: { latitude: 27.9881, longitude: 86.925 },
        },
      }),
    )

    unmount()
    window.history.replaceState(
      {},
      '',
      '/explore?desert=sahara&latitude=23&longitude=13',
    )
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    expect(await screen.findByLabelText('撒哈拉沙漠知识卡')).toBeVisible()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        showDesertLayer: true,
        selectedDesertId: 'sahara',
        cameraTarget: {
          position: { latitude: 23, longitude: 13 },
        },
      }),
    )
  }, 10_000)

  it('supports coordinate-only deep links and rejects incomplete or out-of-range coordinates', async () => {
    expect(
      parseExploreDeepLinkPosition(
        new URLSearchParams('latitude=23.5&longitude=47.5'),
      ),
    ).toEqual({ latitude: 23.5, longitude: 47.5 })
    expect(
      parseExploreDeepLinkPosition(new URLSearchParams('latitude=23.5')),
    ).toBeUndefined()
    expect(
      parseExploreDeepLinkPosition(
        new URLSearchParams('latitude=91&longitude=47.5'),
      ),
    ).toBeUndefined()

    window.history.replaceState({}, '', '/explore?latitude=23.5&longitude=47.5')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByTestId('mock-globe-scene')).toBeVisible()
    expect(screen.getByLabelText('3D 地球使用说明')).toBeVisible()
    await waitFor(() =>
      expect(globePropsMock.mock.lastCall?.[0]).toMatchObject({
        selectedCountryCode: null,
        selectedWaterbodyId: null,
        selectedLinearFeatureId: null,
        selectedMountainRangeId: null,
        selectedDesertId: null,
        cameraTarget: {
          position: { latitude: 23.5, longitude: 47.5 },
        },
      }),
    )
  })

  it('keeps country and geography ahead of water deep links', async () => {
    window.history.replaceState(
      {},
      '',
      '/explore?country=CN&geography=earth-zones&line=tropic-of-cancer&waterbody=lake-baikal&linearFeature=amazon-system',
    )
    const { unmount } = render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(await screen.findByLabelText('中国国家知识卡')).toBeVisible()
    expect(screen.queryByLabelText('地球经纬线知识卡')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('贝加尔湖水域知识卡'),
    ).not.toBeInTheDocument()

    unmount()
    window.history.replaceState(
      {},
      '',
      '/explore?country=XX&geography=earth-zones&line=tropic-of-cancer&waterbody=lake-baikal&linearFeature=amazon-system',
    )
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    expect(await screen.findByLabelText('地球经纬线知识卡')).toBeVisible()
    expect(
      screen.queryByLabelText('贝加尔湖水域知识卡'),
    ).not.toBeInTheDocument()
  })

  it('shows the globe and control deck without page chrome or search controls', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(
      screen.queryByRole('heading', {
        name: '转动地球，发现每一片土地',
      }),
    ).not.toBeInTheDocument()
    expect(await screen.findByTestId('mock-globe-scene')).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: '地球显示控制' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '搜索地点' })).toBeNull()
    expect(
      screen.queryByRole('combobox', { name: '搜索地点' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Scio Geo 首页' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('SCIO GEO · EARTH EXPLORATION LAB'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('world-mini-map')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: '地球图层控制' }),
    ).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: '图层，已开启 0 项' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: '图层选择' })).toBeNull()
    const panel = await openLayerPanel(user)
    expect(
      within(panel)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['标注', '地球知识', '水域', '地貌与文化'])
    expect(within(panel).getAllByRole('button')).toHaveLength(10)
    expect(screen.queryByRole('button', { name: '首都' })).toBeNull()
    expect(screen.getByRole('button', { name: '城市' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      screen.getByRole('button', { name: '世界气候类型教学图层' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '海洋' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '水域' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      screen.getByRole('button', {
        name: '湖泊图层：世界著名淡水与咸水湖泊',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', {
        name: '河流图层：世界重要河流与人工运河',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.queryByRole('button', { name: '运河图层：重要人工运河' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: '山脉图层：世界著名山脉与最高峰',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', {
        name: '沙漠图层：世界主要沙漠与荒漠景观',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', {
        name: '名胜古迹图层：世界著名文化与历史遗产',
      }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('海洋：大洋、海与海湾')).toBeInTheDocument()
    expect(screen.getByText('水域：海峡与海沟')).toBeInTheDocument()
  })

  it('closes the layer panel from the globe and restores focus', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    const layerTrigger = screen.getByRole('button', {
      name: '图层，已开启 0 项',
    })
    await user.click(layerTrigger)
    expect(screen.getByRole('region', { name: '图层选择' })).toBeVisible()

    await user.click(await screen.findByTestId('mock-globe-scene'))
    expect(screen.queryByRole('region', { name: '图层选择' })).toBeNull()
    expect(layerTrigger).toHaveFocus()
  })

  it('keeps the camera target unchanged when globe objects are selected directly', () => {
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        cameraTarget: {
          requestId: number
          position: GeoPosition
          distance: number
        }
        selectedCountryCode: string | null
        selectedWaterbodyId: string | null
        selectedLinearFeatureId: string | null
        selectedMountainRangeId: string | null
        selectedDesertId: string | null
        selectedLandmarkId: string | null
        selectedReferenceLineId: string | null
      }
    const initialCameraTarget = structuredClone(getProps().cameraTarget)
    const directSelections = [
      {
        event: 'onSelectCountry',
        args: ['CN'],
        expected: { selectedCountryCode: 'CN' },
      },
      {
        event: 'onSelectWaterbody',
        args: ['pacific-ocean'],
        expected: { selectedWaterbodyId: 'pacific-ocean' },
      },
      {
        event: 'onSelectLinearFeature',
        args: ['yangtze-system'],
        expected: { selectedLinearFeatureId: 'yangtze-system' },
      },
      {
        event: 'onSelectMountainRange',
        args: ['himalayas'],
        expected: { selectedMountainRangeId: 'himalayas' },
      },
      {
        event: 'onSelectDesert',
        args: ['sahara'],
        expected: { selectedDesertId: 'sahara' },
      },
      {
        event: 'onSelectLandmark',
        args: ['great-wall'],
        expected: { selectedLandmarkId: 'great-wall' },
      },
      {
        event: 'onSelectGeographyTopic',
        args: ['earth-zones', 'tropic-of-cancer'],
        expected: { selectedReferenceLineId: 'tropic-of-cancer' },
      },
    ] as const

    for (const selection of directSelections) {
      callGlobeEvent(selection.event, ...selection.args)
      expect(getProps()).toMatchObject(selection.expected)
      expect(getProps().cameraTarget).toEqual(initialCameraTarget)
    }

    callGlobeEvent('onSelectCountry', 'CN')
    expect(getProps().cameraTarget).toEqual(initialCameraTarget)
  })

  it('still creates a camera request for the explicit reset action', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getCameraTarget = () =>
      (
        globePropsMock.mock.lastCall![0] as {
          cameraTarget: {
            requestId: number
            position: GeoPosition
            distance: number
          }
        }
      ).cameraTarget
    const initialRequestId = getCameraTarget().requestId

    await user.click(screen.getByRole('button', { name: '重置视角' }))

    expect(getCameraTarget()).toMatchObject({
      requestId: initialRequestId + 1,
      distance: 425,
    })
  })

  it('shows only the fallback when WebGL is unavailable', () => {
    supportsWebGLMock.mockReturnValue(false)

    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    expect(screen.getByTestId('webgl-fallback')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-globe-scene')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: '地球显示控制' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: '地球图层控制' }),
    ).not.toBeInTheDocument()
  })

  it('keeps major cities static inside the country card', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/explore?country=CN')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    await screen.findByLabelText('中国国家知识卡')
    await user.click(screen.getByRole('button', { name: /^主要城市/ }))
    expect(screen.getByText('上海', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Shanghai', { exact: true })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /探索城市/ })).toBeNull()
    expect(globePropsMock.mock.lastCall![0]).not.toHaveProperty(
      'selectedCityId',
    )
    expect(screen.getByLabelText('中国国家知识卡')).toBeInTheDocument()
  })

  it('uses one city layer without auto-activating it for country selection', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showCities: boolean
        selectedCountryCode: string | null
      }

    expect(getProps()).toMatchObject({
      showCities: false,
      selectedCountryCode: null,
    })

    callGlobeEvent('onSelectCountry', 'CN')
    expect(getProps()).toMatchObject({
      showCities: false,
      selectedCountryCode: 'CN',
    })

    await openLayerPanel(user)
    await user.click(screen.getByRole('button', { name: '城市' }))
    expect(getProps()).toMatchObject({
      showCities: true,
      selectedCountryCode: 'CN',
    })
    expect(screen.getByRole('button', { name: '城市' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    callGlobeEvent('onSelectCountry', 'US')
    expect(getProps()).toMatchObject({
      showCities: true,
      selectedCountryCode: 'US',
    })

    callGlobeEvent('onSelectWaterbody', 'lake-baikal')
    expect(getProps()).toMatchObject({
      showCities: true,
      selectedCountryCode: null,
      selectedWaterbodyId: 'lake-baikal',
    })

    unmount()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    expect(getProps()).toMatchObject({
      showCities: false,
      selectedCountryCode: null,
    })
  })

  it('toggles waterbody layers and opens a searched waterbody card', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showOceanLayer: boolean
        showLakeLayer: boolean
        showWaterwayLayer: boolean
        selectedWaterbodyId: string | null
        selectedCountryCode: string | null
      }

    await openLayerPanel(user)
    await user.click(screen.getByRole('button', { name: '海洋' }))
    expect(getProps()).toMatchObject({
      showOceanLayer: true,
      showLakeLayer: false,
      showWaterwayLayer: false,
    })
    let lakeToggle = screen.getByRole('button', {
      name: '湖泊图层：世界著名淡水与咸水湖泊',
    })
    await openLayerPanel(user)
    lakeToggle = screen.getByRole('button', {
      name: '湖泊图层：世界著名淡水与咸水湖泊',
    })
    await user.click(lakeToggle)
    expect(getProps()).toMatchObject({
      showOceanLayer: true,
      showLakeLayer: true,
      showWaterwayLayer: false,
    })
    await user.click(screen.getByRole('button', { name: '水域' }))
    expect(getProps()).toMatchObject({
      showOceanLayer: true,
      showLakeLayer: true,
      showWaterwayLayer: true,
    })

    callGlobeEvent('onSelectWaterbody', 'pacific-ocean')
    expect(await screen.findByLabelText('太平洋水域知识卡')).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      selectedWaterbodyId: 'pacific-ocean',
      selectedCountryCode: null,
    })
    expect(screen.queryByText(/不代表领海/)).not.toBeInTheDocument()

    callGlobeEvent('onSelectWaterbody', 'bohai-sea')
    expect(await screen.findByLabelText('渤海水域知识卡')).toBeInTheDocument()
    expect(getProps()).toMatchObject({ selectedWaterbodyId: 'bohai-sea' })
    expect(screen.getByText('中国东北部沿海、黄海西北部')).toBeInTheDocument()

    await openLayerPanel(user)
    lakeToggle = screen.getByRole('button', {
      name: '湖泊图层：世界著名淡水与咸水湖泊',
    })
    await user.click(lakeToggle)
    expect(getProps()).toMatchObject({ showLakeLayer: false })
    callGlobeEvent('onSelectWaterbody', 'lake-baikal')
    expect(
      await screen.findByLabelText('贝加尔湖水域知识卡'),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showLakeLayer: true,
      selectedWaterbodyId: 'lake-baikal',
    })
    expect(screen.getByText('1,642 m')).toBeInTheDocument()
    expect(
      screen.queryByText(/水位、季节和长期环境变化/),
    ).not.toBeInTheDocument()

    await openLayerPanel(user)
    lakeToggle = screen.getByRole('button', {
      name: '湖泊图层：世界著名淡水与咸水湖泊',
    })
    await user.click(lakeToggle)
    expect(getProps()).toMatchObject({
      showLakeLayer: false,
      selectedWaterbodyId: 'lake-baikal',
    })
    expect(screen.getByLabelText('贝加尔湖水域知识卡')).toBeInTheDocument()

    await user.click(lakeToggle)
    expect(getProps()).toMatchObject({
      showLakeLayer: true,
      selectedWaterbodyId: 'lake-baikal',
    })
    expect(
      screen.queryByRole('button', { name: '关闭水域知识卡' }),
    ).not.toBeInTheDocument()
  })

  it('toggles river and canal layers and keeps all place selection mutually exclusive', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showRiverAndCanalLayer: boolean
        selectedLinearFeatureId: string | null
        selectedWaterbodyId: string | null
        selectedCountryCode: string | null
      }

    await openLayerPanel(user)
    await user.click(
      screen.getByRole('button', {
        name: '河流图层：世界重要河流与人工运河',
      }),
    )
    expect(getProps()).toMatchObject({
      showRiverAndCanalLayer: true,
    })
    expect(
      screen.queryByRole('button', { name: '运河图层：重要人工运河' }),
    ).not.toBeInTheDocument()

    callGlobeEvent('onSelectLinearFeature', 'yangtze-system')
    expect(await screen.findByLabelText('长江知识卡')).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      selectedLinearFeatureId: 'yangtze-system',
      selectedWaterbodyId: null,
      selectedCountryCode: null,
    })

    callGlobeEvent('onSelectLinearFeature', 'suez-canal')
    expect(await screen.findByLabelText('苏伊士运河知识卡')).toBeInTheDocument()
    expect(screen.queryByLabelText('长江知识卡')).not.toBeInTheDocument()
  })

  it('toggles the mountain layer and opens a highest-peak knowledge card', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showMountainLayer: boolean
        selectedMountainRangeId: string | null
        selectedLinearFeatureId: string | null
        selectedCountryCode: string | null
      }

    await openLayerPanel(user)
    const toggle = screen.getByRole('button', {
      name: '山脉图层：世界著名山脉与最高峰',
    })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(getProps()).toMatchObject({ showMountainLayer: true })

    callGlobeEvent('onSelectMountainRange', 'himalayas')
    expect(
      await screen.findByLabelText('喜马拉雅山脉知识卡'),
    ).toBeInTheDocument()
    expect(screen.getByText('珠穆朗玛峰')).toBeInTheDocument()
    expect(screen.getByText(/8,849 m/)).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      selectedMountainRangeId: 'himalayas',
      selectedLinearFeatureId: null,
      selectedCountryCode: null,
    })
  })

  it('activates the desert layer on selection and hides it without closing the card', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showDesertLayer: boolean
        selectedDesertId: string | null
        selectedMountainRangeId: string | null
        selectedCountryCode: string | null
      }

    callGlobeEvent('onSelectDesert', 'sahara')
    expect(await screen.findByLabelText('撒哈拉沙漠知识卡')).toBeInTheDocument()
    expect(screen.getByText(/9,200,000 km²/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '图层，已开启 1 项' }),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showDesertLayer: true,
      selectedDesertId: 'sahara',
      selectedMountainRangeId: null,
      selectedCountryCode: null,
    })

    await openLayerPanel(user)
    const toggle = screen.getByRole('button', {
      name: '沙漠图层：世界主要沙漠与荒漠景观',
    })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('撒哈拉沙漠知识卡')).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showDesertLayer: false,
      selectedDesertId: 'sahara',
    })
  })

  it('activates the landmark layer on selection and hides it without closing the card', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showLandmarkLayer: boolean
        selectedLandmarkId: string | null
        selectedDesertId: string | null
        selectedCountryCode: string | null
      }

    callGlobeEvent('onSelectLandmark', 'great-wall')

    expect(await screen.findByLabelText('长城古迹知识卡')).toBeInTheDocument()
    expect(screen.getByText('公元前7世纪至明代')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '图层，已开启 1 项' }),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showLandmarkLayer: true,
      selectedLandmarkId: 'great-wall',
      selectedDesertId: null,
      selectedCountryCode: null,
    })

    await openLayerPanel(user)
    const toggle = screen.getByRole('button', {
      name: '名胜古迹图层：世界著名文化与历史遗产',
    })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('长城古迹知识卡')).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showLandmarkLayer: false,
      selectedLandmarkId: 'great-wall',
    })
  })

  it('opens the geography learning card, keeps it after hiding the layer, and updates committed interpretation', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showGeographyLearningLayer: boolean
        selectedGeographyTopicId: string | null
        selectedReferenceLineId: string | null
        onViewCenterChange: (view: {
          position: { latitude: number; longitude: number }
          distance: number
        }) => void
        onViewCenterCommit: (view: {
          position: { latitude: number; longitude: number }
          distance: number
        }) => void
      }

    await openLayerPanel(user)
    let toggle = screen.getByRole('button', {
      name: '经纬图层：经度基准、半球界线、纬度分区线与五带分界线',
    })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    act(() =>
      getProps().onViewCenterChange({
        position: { latitude: 23.5, longitude: -20 },
        distance: 320,
      }),
    )
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const card = screen.getByLabelText('地球经纬线知识卡')
    expect(
      within(card).getByRole('heading', { name: '地球经纬线' }),
    ).toBeInTheDocument()
    const categories = within(card).getByLabelText('地球经纬线分类')
    expect(
      within(categories).getAllByRole('heading', { level: 3 }),
    ).toHaveLength(4)
    expect(within(categories).getAllByRole('button')).toHaveLength(13)
    expect(within(card).getAllByRole('button')).toHaveLength(13)
    expect(within(card).queryByText(/条重点线/)).toBeNull()
    expect(
      within(card).queryByText(/用纬线和经线为地球表面建立坐标/),
    ).toBeNull()
    expect(getProps()).toMatchObject({
      showGeographyLearningLayer: true,
      selectedGeographyTopicId: null,
      selectedReferenceLineId: null,
    })
    expect(screen.getByLabelText('当前中心判读')).toHaveTextContent(
      '热带与温带分界线上',
    )

    act(() =>
      getProps().onViewCenterCommit({
        position: { latitude: -66.5, longitude: 160 },
        distance: 320,
      }),
    )
    expect(screen.getByLabelText('当前中心判读')).toHaveTextContent(
      '东西半球分界线上',
    )
    expect(screen.getByLabelText('当前中心判读')).toHaveTextContent(
      '温带与寒带分界线上',
    )

    await user.click(within(card).getByRole('button', { name: /北回归线/ }))
    expect(
      within(card).getByRole('heading', { name: '北回归线' }),
    ).toBeInTheDocument()
    expect(within(card).getByText('五带分界线')).toBeInTheDocument()
    expect(
      within(card).getByRole('button', { name: /南回归线/ }),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      selectedGeographyTopicId: 'earth-zones',
      selectedReferenceLineId: 'tropic-of-cancer',
    })

    await user.click(within(card).getByRole('button', { name: /南回归线/ }))
    expect(
      within(card).getByRole('heading', { name: '南回归线' }),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      selectedGeographyTopicId: 'earth-zones',
      selectedReferenceLineId: 'tropic-of-capricorn',
    })

    await user.click(
      within(card).getByRole('button', { name: '返回地球经纬线' }),
    )
    expect(
      within(card).getByRole('heading', { name: '地球经纬线' }),
    ).toBeInTheDocument()
    expect(within(card).getByLabelText('五带分界线经纬线')).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(getProps()).toMatchObject({
      selectedGeographyTopicId: 'earth-zones',
      selectedReferenceLineId: null,
    })

    expect(
      within(card).queryByRole('button', { name: '关闭地球经纬线知识卡' }),
    ).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await openLayerPanel(user)
    toggle = screen.getByRole('button', {
      name: '经纬图层：经度基准、半球界线、纬度分区线与五带分界线',
    })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('地球经纬线知识卡')).toBeInTheDocument()

    await user.click(toggle)
    const reopenedCard = screen.getByLabelText('地球经纬线知识卡')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(reopenedCard).getByRole('heading', { name: '地球经纬线' }),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      selectedGeographyTopicId: null,
      selectedReferenceLineId: null,
    })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('地球经纬线知识卡')).toBeInTheDocument()
  })

  it('opens the climate overview, keeps the card after hiding, and classifies globe clicks', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showClimateLayer: boolean
        selectedClimateTypeId: string | null
        climateBoundaryRasterUrl: string | null
        selectedClimatePosition: GeoPosition | null
        onSelectClimatePosition: (position: GeoPosition) => void
      }
    await openLayerPanel(user)
    let toggle = screen.getByRole('button', {
      name: '世界气候类型教学图层',
    })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('世界气候类型知识卡')).toBeInTheDocument()
    expect(screen.getByLabelText('13类世界气候图例')).toBeInTheDocument()
    expect(getProps().showClimateLayer).toBe(true)
    expect(getProps().selectedClimateTypeId).toBeNull()

    act(() =>
      getProps().onSelectClimatePosition({
        latitude: 39.9,
        longitude: 116.4,
      }),
    )
    expect(
      await screen.findByRole('heading', { name: '温带季风气候' }),
    ).toBeInTheDocument()
    expect(getProps().selectedClimatePosition).toEqual({
      latitude: 39.9,
      longitude: 116.4,
    })
    expect(getProps().selectedClimateTypeId).toBe('temperate-monsoon')
    await waitFor(() =>
      expect(getProps().climateBoundaryRasterUrl).toBe(
        '/climate/highlight-boundaries/balanced/temperate-monsoon.png',
      ),
    )

    await user.click(screen.getByRole('button', { name: '查看13类气候图例' }))
    expect(getProps().selectedClimateTypeId).toBeNull()
    await waitFor(() => expect(getProps().climateBoundaryRasterUrl).toBeNull())

    await openLayerPanel(user)
    toggle = screen.getByRole('button', {
      name: '世界气候类型教学图层',
    })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('世界气候类型知识卡')).toBeInTheDocument()
  })

  it('opens a climate deep link and lets a country replace the card', async () => {
    window.history.replaceState({}, '', '/explore?climate=tropical-rainforest')
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showClimateLayer: boolean
        selectedClimateTypeId: string | null
        climateBoundaryRasterUrl: string | null
        cameraTarget: { position: GeoPosition }
      }

    expect(
      await screen.findByLabelText('世界气候类型知识卡'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '热带雨林气候' }),
    ).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showClimateLayer: true,
      selectedClimateTypeId: 'tropical-rainforest',
      cameraTarget: { position: { latitude: -3.1, longitude: -60 } },
    })
    await waitFor(() =>
      expect(getProps().climateBoundaryRasterUrl).toBe(
        '/climate/highlight-boundaries/balanced/tropical-rainforest.png',
      ),
    )

    callGlobeEvent('onSelectCountry', 'CN')
    expect(
      screen.queryByLabelText('世界气候类型知识卡'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('中国国家知识卡')).toBeInTheDocument()
    expect(getProps().showClimateLayer).toBe(true)
    expect(getProps().selectedClimateTypeId).toBeNull()
    await waitFor(() => expect(getProps().climateBoundaryRasterUrl).toBeNull())
    expect(
      screen.queryByRole('button', { name: '关闭国家知识卡' }),
    ).not.toBeInTheDocument()
  })

  it('selects a reference line and replaces it with a country card', () => {
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )
    const getProps = () =>
      globePropsMock.mock.lastCall![0] as {
        showGeographyLearningLayer: boolean
        selectedGeographyTopicId: string | null
        selectedReferenceLineId: string | null
        cameraTarget: { position: { latitude: number; longitude: number } }
      }

    const initialCameraTarget = structuredClone(getProps().cameraTarget)
    callGlobeEvent('onSelectGeographyTopic', 'earth-zones', 'tropic-of-cancer')

    expect(screen.getByLabelText('地球经纬线知识卡')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '北回归线' }),
    ).toBeInTheDocument()
    expect(screen.getByText('23.5°N')).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showGeographyLearningLayer: true,
      selectedGeographyTopicId: 'earth-zones',
      selectedReferenceLineId: 'tropic-of-cancer',
    })
    expect(getProps().cameraTarget).toEqual(initialCameraTarget)

    callGlobeEvent('onSelectCountry', 'CN')
    expect(screen.queryByLabelText('地球经纬线知识卡')).not.toBeInTheDocument()
    expect(screen.getByLabelText('中国国家知识卡')).toBeInTheDocument()
    expect(getProps()).toMatchObject({
      showGeographyLearningLayer: true,
      selectedGeographyTopicId: null,
      selectedReferenceLineId: null,
    })
  })

  it('does not reveal the city layer when the committed globe view changes', () => {
    render(
      <Tooltip.Provider>
        <ExplorePage />
      </Tooltip.Provider>,
    )

    const props = globePropsMock.mock.lastCall![0] as {
      showCities: boolean
      onViewCenterCommit: (view: {
        position: { latitude: number; longitude: number }
        distance: number
      }) => void
    }

    props.onViewCenterCommit({
      position: { latitude: 35, longitude: 105 },
      distance: 240,
    })
    expect(globePropsMock.mock.lastCall![0]).toMatchObject({
      showCities: false,
    })
  })
})
