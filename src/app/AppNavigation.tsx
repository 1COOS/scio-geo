import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import {
  BackIcon,
  BookIcon,
  GlobeIcon,
  SearchIcon,
} from '../shared/components/AppNavigationIcons'
import { sceneOverlayRoles } from '../shared/types/sceneOverlay'

import {
  isDocumentFullscreen,
  isManualFullscreenAvailable,
  toggleDocumentFullscreen,
} from './fullscreenPlatform'
import {
  getNavigationParentPath,
  resolveAppRouteMeta,
} from './navigationRoutes'

const fullscreenDoubleTapWindow = 350

function FullscreenBrand() {
  const [available] = useState(() => isManualFullscreenAvailable())
  const [active, setActive] = useState(() => isDocumentFullscreen())
  const lastTouchReleaseRef = useRef(0)
  const lastTouchToggleRef = useRef(0)

  useEffect(() => {
    if (!available) return

    const syncFullscreenState = () => setActive(isDocumentFullscreen())
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [available])

  const toggleFullscreen = () => {
    void toggleDocumentFullscreen().then(() =>
      setActive(isDocumentFullscreen()),
    )
  }
  const label = active ? 'Scio Geo，双击退出全屏' : 'Scio Geo，双击进入全屏'
  const logo = <img src="/icons/scio-geo-mark.svg" alt="" draggable={false} />

  if (!available) {
    return (
      <div className="app-navigation-brand" aria-hidden="true">
        {logo}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="app-navigation-brand app-navigation-logo-control"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={(event) => {
        if (event.detail === 0) toggleFullscreen()
      }}
      onDoubleClick={() => {
        if (
          lastTouchToggleRef.current > 0 &&
          performance.now() - lastTouchToggleRef.current <
            fullscreenDoubleTapWindow
        ) {
          return
        }
        toggleFullscreen()
      }}
      onPointerUp={(event) => {
        if (event.pointerType === 'mouse') return
        const now = performance.now()
        if (
          lastTouchReleaseRef.current > 0 &&
          now - lastTouchReleaseRef.current <= fullscreenDoubleTapWindow
        ) {
          lastTouchReleaseRef.current = 0
          lastTouchToggleRef.current = now
          toggleFullscreen()
        } else {
          lastTouchReleaseRef.current = now
        }
      }}
    >
      {logo}
    </button>
  )
}

function AtlasNavigationLink() {
  const location = useLocation()
  const atlasActive =
    resolveAppRouteMeta(location.pathname).section === 'knowledge'

  return (
    <NavLink
      to="/knowledge"
      className={
        atlasActive ? 'app-navigation-link is-active' : 'app-navigation-link'
      }
      aria-label="图鉴"
      aria-current={atlasActive ? 'page' : undefined}
    >
      <BookIcon />
      <span>图鉴</span>
    </NavLink>
  )
}

function NavigationBrand() {
  const location = useLocation()
  const navigate = useNavigate()
  const route = resolveAppRouteMeta(location.pathname)

  if (route.primary) return <FullscreenBrand />

  return (
    <button
      type="button"
      className="app-navigation-brand app-navigation-back"
      aria-label="返回上一级"
      onClick={() => {
        void navigate(getNavigationParentPath(location.pathname), {
          replace: true,
        })
      }}
    >
      <BackIcon />
    </button>
  )
}

export function AppNavigation() {
  return (
    <nav
      className="app-navigation"
      data-scene-overlay={sceneOverlayRoles.navigation}
      aria-label="Scio Geo 主导航"
    >
      <NavigationBrand />
      <NavLink
        to="/explore"
        className={({ isActive }) =>
          isActive ? 'app-navigation-link is-active' : 'app-navigation-link'
        }
        aria-label="探索地球"
      >
        <GlobeIcon />
        <span>探索</span>
      </NavLink>
      <AtlasNavigationLink />
      <NavLink
        to="/search"
        className={({ isActive }) =>
          isActive ? 'app-navigation-link is-active' : 'app-navigation-link'
        }
        aria-label="搜索"
      >
        <SearchIcon />
        <span>搜索</span>
      </NavLink>
    </nav>
  )
}
