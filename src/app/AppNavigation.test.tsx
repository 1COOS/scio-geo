import * as Tooltip from '@radix-ui/react-tooltip'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import { AppNavigation } from './AppNavigation'
import { getNavigationParentPath } from './navigationRoutes'

type FullscreenHarness = {
  exitFullscreen: ReturnType<typeof vi.fn>
  requestFullscreen: ReturnType<typeof vi.fn>
  setFullscreenElement: (element: Element | null) => void
}

function createMatchMedia(fullscreenDisplayMode = false) {
  return vi.fn((query: string) => ({
    matches: query === '(display-mode: fullscreen)' && fullscreenDisplayMode,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function installFullscreenHarness({
  enabled = true,
  fullscreenDisplayMode = false,
  requestRejects = false,
}: {
  enabled?: boolean
  fullscreenDisplayMode?: boolean
  requestRejects?: boolean
} = {}): FullscreenHarness {
  let fullscreenElement: Element | null = null
  const dispatchChange = () =>
    document.dispatchEvent(new Event('fullscreenchange'))
  const requestFullscreen = vi.fn(() => {
    if (requestRejects) {
      return Promise.reject(new DOMException('Not allowed'))
    }
    fullscreenElement = document.documentElement
    dispatchChange()
    return Promise.resolve()
  })
  const exitFullscreen = vi.fn(() => {
    fullscreenElement = null
    dispatchChange()
    return Promise.resolve()
  })

  vi.stubGlobal('matchMedia', createMatchMedia(fullscreenDisplayMode))
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: enabled,
  })
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  })
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exitFullscreen,
  })

  return {
    exitFullscreen,
    requestFullscreen,
    setFullscreenElement: (element) => {
      fullscreenElement = element
      dispatchChange()
    },
  }
}

function renderNavigation(initialEntry = '/explore') {
  return render(
    <Tooltip.Provider delayDuration={0}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppNavigation />
      </MemoryRouter>
    </Tooltip.Provider>,
  )
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fullscreenEnabled')
  Reflect.deleteProperty(document, 'fullscreenElement')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
})

describe('AppNavigation brand', () => {
  it.each(['/explore', '/knowledge', '/search'])(
    'uses the Scio Geo logo on the primary %s page',
    (path) => {
      installFullscreenHarness({ enabled: false })
      const { container } = renderNavigation(path)
      const brand = container.querySelector('.app-navigation-brand')
      const logo = brand?.querySelector('img')

      expect(logo).toHaveAttribute('src', '/icons/scio-geo-mark.svg')
      expect(logo).toHaveAttribute('alt', '')
      expect(screen.queryByRole('button', { name: '返回上一级' })).toBeNull()
    },
  )

  it('shows a back button on descendant pages', () => {
    installFullscreenHarness({ enabled: false })
    const { container } = renderNavigation('/knowledge/earth')

    expect(container.querySelector('.app-navigation-brand img')).toBeNull()
    expect(screen.getByRole('button', { name: '返回上一级' })).toBeVisible()
  })

  it.each([
    ['/knowledge/earth', '/knowledge'],
    ['/knowledge/earth/lines/equator', '/knowledge/earth'],
    ['/knowledge/countries/east-asia', '/knowledge/countries'],
    ['/knowledge/water/groups/ocean-seas', '/knowledge/water'],
    ['/knowledge/extremes/metrics/highest-peak', '/knowledge/extremes'],
    ['/questions', '/knowledge'],
    ['/questions/asia/easy', '/questions?difficulty=easy'],
    ['/questions/world/hard', '/questions?difficulty=hard'],
    ['/unknown', '/explore'],
  ])('resolves the parent of %s as %s', (path, fallback) => {
    expect(getNavigationParentPath(path)).toBe(fallback)
  })

  it('returns to the route parent instead of the history source', async () => {
    const user = userEvent.setup()
    installFullscreenHarness({ enabled: false })

    function LocationProbe() {
      return <output data-testid="location">{useLocation().pathname}</output>
    }

    render(
      <Tooltip.Provider delayDuration={0}>
        <MemoryRouter initialEntries={['/search']}>
          <AppNavigation />
          <Routes>
            <Route
              path="/search"
              element={
                <Link to="/knowledge/countries/east-asia?country=CN">
                  打开中国区域详情
                </Link>
              }
            />
            <Route path="/knowledge/countries" element={<div>国家首都</div>} />
            <Route
              path="/knowledge/countries/east-asia"
              element={<div>东亚详情</div>}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </Tooltip.Provider>,
    )

    await user.click(screen.getByRole('link', { name: '打开中国区域详情' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/knowledge/countries/east-asia',
    )
    await user.click(screen.getByRole('button', { name: '返回上一级' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/knowledge/countries',
    )
  })

  it('returns from a challenge to its selected difficulty', async () => {
    const user = userEvent.setup()
    installFullscreenHarness({ enabled: false })

    function LocationProbe() {
      const location = useLocation()
      return (
        <output data-testid="location">
          {location.pathname}
          {location.search}
        </output>
      )
    }

    render(
      <Tooltip.Provider delayDuration={0}>
        <MemoryRouter initialEntries={['/questions/world/hard']}>
          <AppNavigation />
          <LocationProbe />
        </MemoryRouter>
      </Tooltip.Provider>,
    )

    await user.click(screen.getByRole('button', { name: '返回上一级' }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/questions?difficulty=hard',
    )
  })
})

describe('AppNavigation routes', () => {
  it.each([
    '/knowledge',
    '/knowledge/earth/lines/equator',
    '/knowledge/countries/east-asia',
    '/knowledge/extremes/metrics/highest-point',
    '/knowledge/water/groups/ocean-seas',
    '/questions',
    '/questions/asia/easy',
  ])('uses the unified atlas link for %s', (path) => {
    installFullscreenHarness({ enabled: false })
    renderNavigation(path)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      '探索',
      '图鉴',
      '搜索',
    ])
    expect(screen.getByRole('link', { name: '图鉴' })).toHaveClass('is-active')
    expect(screen.queryByLabelText('知识二级菜单')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '知识问答' })).toBeNull()
  })

  it('activates the standalone search route', () => {
    installFullscreenHarness({ enabled: false })
    renderNavigation('/search')

    expect(screen.getByRole('link', { name: '搜索' })).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: '图鉴' })).not.toHaveClass(
      'is-active',
    )
  })
})

describe('AppNavigation fullscreen logo', () => {
  it('keeps a non-interactive logo when the Fullscreen API is unavailable', () => {
    installFullscreenHarness({ enabled: false })
    const { container } = renderNavigation()

    expect(container.querySelector('.app-navigation-brand img')).toBeVisible()
    expect(container.querySelector('.app-navigation-logo-control')).toBeNull()
    expect(screen.queryByText('全屏')).toBeNull()
  })

  it('keeps a non-interactive logo in manifest fullscreen display mode', () => {
    installFullscreenHarness({ fullscreenDisplayMode: true })
    const { container } = renderNavigation()

    expect(container.querySelector('.app-navigation-logo-control')).toBeNull()
  })

  it('ignores a single click and toggles fullscreen on a mouse double click', async () => {
    const user = userEvent.setup()
    const fullscreen = installFullscreenHarness()
    renderNavigation()

    const enterFullscreen = screen.getByRole('button', {
      name: 'Scio Geo，双击进入全屏',
    })
    await user.click(enterFullscreen)
    expect(fullscreen.requestFullscreen).not.toHaveBeenCalled()
    await user.dblClick(enterFullscreen)
    expect(fullscreen.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Scio Geo，双击退出全屏' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('link', { name: '图鉴' }))
    const exitFullscreen = screen.getByRole('button', {
      name: 'Scio Geo，双击退出全屏',
    })
    await user.dblClick(exitFullscreen)
    expect(fullscreen.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Scio Geo，双击进入全屏' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('全屏')).toBeNull()
  })

  it('toggles fullscreen after a touch double tap', async () => {
    const fullscreen = installFullscreenHarness()
    renderNavigation()
    const logo = screen.getByRole('button', {
      name: 'Scio Geo，双击进入全屏',
    })

    fireEvent.pointerUp(logo, { pointerType: 'touch' })
    expect(fullscreen.requestFullscreen).not.toHaveBeenCalled()
    fireEvent.pointerUp(logo, { pointerType: 'touch' })
    await waitFor(() =>
      expect(fullscreen.requestFullscreen).toHaveBeenCalledTimes(1),
    )
  })

  it('provides an immediate keyboard alternative', async () => {
    const user = userEvent.setup()
    const fullscreen = installFullscreenHarness()
    renderNavigation()
    const logo = screen.getByRole('button', {
      name: 'Scio Geo，双击进入全屏',
    })

    logo.focus()
    await user.keyboard('{Enter}')
    expect(fullscreen.requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('synchronizes when the browser exits fullscreen externally', async () => {
    const user = userEvent.setup()
    const fullscreen = installFullscreenHarness()
    renderNavigation()

    await user.dblClick(
      screen.getByRole('button', { name: 'Scio Geo，双击进入全屏' }),
    )
    fullscreen.setFullscreenElement(null)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Scio Geo，双击进入全屏' }),
      ).toBeInTheDocument(),
    )
  })

  it('keeps the normal state when the browser rejects the request', async () => {
    const user = userEvent.setup()
    const fullscreen = installFullscreenHarness({ requestRejects: true })
    renderNavigation()

    await user.dblClick(
      screen.getByRole('button', { name: 'Scio Geo，双击进入全屏' }),
    )

    expect(fullscreen.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Scio Geo，双击进入全屏' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })
})
