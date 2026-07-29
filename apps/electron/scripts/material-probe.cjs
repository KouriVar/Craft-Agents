const { app, BrowserWindow, nativeTheme } = require('electron')
const os = require('os')

function windowsBuildNumber() {
  if (process.platform !== 'win32') return undefined
  const build = Number.parseInt(os.release().split('.')[2] || '0', 10)
  return Number.isFinite(build) ? build : undefined
}

function windowsAcrylicSupported() {
  const build = windowsBuildNumber()
  return process.env.CA_FORCE_WINDOWS_ACRYLIC === '1' || (typeof build === 'number' && build >= 22621)
}

function createProbeHtml(profile) {
  const payload = JSON.stringify({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    osRelease: os.release(),
    reduceTransparencyNote: process.platform === 'darwin'
      ? 'If macOS Reduce Transparency is enabled, vibrancy may render as a solid color.'
      : undefined,
    windowsTransparencyNote: process.platform === 'win32'
      ? 'Windows Acrylic requires Windows 11 22H2+ and System Settings > Transparency effects enabled.'
      : undefined,
    profile,
  }, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CraftAgent Material Probe</title>
  <style>
    html, body, #root {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent !important;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1f2328;
    }
    body { -webkit-app-region: drag; }
    .shell {
      position: fixed;
      inset: 0;
      background: rgba(214, 231, 239, 0.16);
      border-radius: 18px;
      box-shadow: inset 0 0 0 1px rgba(35, 45, 55, 0.08);
    }
    .card {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(660px, calc(100vw - 150px));
      min-height: 360px;
      transform: translate(-50%, -50%);
      box-sizing: border-box;
      padding: 28px;
      border-radius: 16px;
      background: #f7f8fa;
      box-shadow: 0 18px 45px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(0,0,0,0.08);
      -webkit-app-region: no-drag;
    }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 18px; color: #68707a; line-height: 1.45; }
    pre {
      margin: 0;
      max-height: 220px;
      overflow: auto;
      border-radius: 10px;
      background: #111827;
      color: #dbeafe;
      padding: 14px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="shell"></div>
    <main class="card">
      <h1>CraftAgent Material Probe</h1>
      <p>The outer area is transparent plus a low-opacity tint. The center rectangle is fully opaque. Move this window over wallpaper or another app; the outer area must show native blur-behind, not CSS backdrop-filter.</p>
      <pre>${payload}</pre>
    </main>
  </div>
</body>
</html>`
}

function createWindow(profile, bounds) {
  const win = new BrowserWindow({
    width: 920,
    height: 620,
    minWidth: 600,
    minHeight: 420,
    show: false,
    title: `Material Probe: ${profile.label}`,
    ...bounds,
    ...profile.options,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const reapply = () => {
    if (win.isDestroyed()) return
    if (profile.macVibrancy) {
      win.setVibrancy(profile.macVibrancy)
      win.setWindowButtonVisibility(true)
      win.setWindowButtonPosition({ x: 18, y: 19 })
    }
    if (profile.windowsMaterial === 'acrylic') {
      win.setBackgroundMaterial('acrylic')
    } else if (process.platform === 'win32') {
      win.setBackgroundMaterial('none')
    }
  }

  win.once('ready-to-show', () => {
    reapply()
    win.show()
  })
  for (const eventName of ['show', 'restore', 'maximize', 'unmaximize']) {
    win.on(eventName, () => {
      reapply()
      setTimeout(reapply, 120)
    })
  }

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createProbeHtml(profile))}`)
  return win
}

app.whenReady().then(() => {
  nativeTheme.themeSource = process.env.CA_MATERIAL_PROBE_THEME === 'dark' ? 'dark' : 'system'

  if (process.platform === 'darwin') {
    const macTransparent = process.env.CA_MAC_VIBRANCY_TRANSPARENT !== '0'
    createWindow({
      label: `macOS under-window transparent=${macTransparent}`,
      macVibrancy: 'under-window',
      options: {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 16 },
        transparent: macTransparent,
        backgroundColor: '#00000000',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        roundedCorners: true,
      },
    }, { x: 80, y: 90 })

    createWindow({
      label: `macOS sidebar transparent=${macTransparent}`,
      macVibrancy: 'sidebar',
      options: {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 16 },
        transparent: macTransparent,
        backgroundColor: '#00000000',
        vibrancy: 'sidebar',
        visualEffectState: 'active',
        roundedCorners: true,
      },
    }, { x: 1040, y: 90 })
    return
  }

  if (process.platform === 'win32') {
    const acrylic = windowsAcrylicSupported()
    createWindow({
      label: acrylic ? 'Windows acrylic' : 'Windows solid fallback',
      windowsMaterial: acrylic ? 'acrylic' : 'none',
      windowsBuild: windowsBuildNumber(),
      windowsAcrylicSupported: acrylic,
      options: acrylic
        ? {
            frame: false,
            autoHideMenuBar: true,
            transparent: process.env.CA_WINDOWS_ACRYLIC_TRANSPARENT === '0' ? false : true,
            backgroundColor: '#00000000',
            backgroundMaterial: 'acrylic',
            roundedCorners: true,
            thickFrame: true,
          }
        : {
            frame: false,
            autoHideMenuBar: true,
            backgroundColor: '#f4f6f8',
            roundedCorners: true,
            thickFrame: true,
          },
    })
    return
  }

  createWindow({
    label: 'solid fallback',
    options: {
      frame: true,
      autoHideMenuBar: true,
      backgroundColor: '#f4f6f8',
    },
  })
})

app.on('window-all-closed', () => app.quit())
