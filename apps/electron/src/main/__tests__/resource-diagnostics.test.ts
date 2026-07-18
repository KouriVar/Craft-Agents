import { beforeEach, describe, expect, it } from 'bun:test'
import {
  createResourceDiagnostic,
  getStartupDiagnostic,
  recordStartupMilestone,
  resetStartupMilestonesForTests,
} from '../resource-diagnostics'

beforeEach(() => resetStartupMilestonesForTests())

describe('startup diagnostics', () => {
  it('records sanitized one-shot monotonic milestones', () => {
    recordStartupMilestone('Electron Ready', 420.4)
    recordStartupMilestone('Electron Ready', 999)
    recordStartupMilestone('app/initialized', 1_250.8)

    expect(getStartupDiagnostic()).toEqual({
      milestonesMs: { 'electron-ready': 420, 'app-initialized': 1_251 },
    })
  })
})

describe('resource diagnostics', () => {
  it('aggregates memory and resource classes without PID or command line data', () => {
    const diagnostic = createResourceDiagnostic({
      appMetrics: [
        { type: 'Browser', memory: { workingSetSize: 102_400, peakWorkingSetSize: 153_600 } },
        { type: 'Tab', memory: { workingSetSize: 51_200, peakWorkingSetSize: 80_000 } },
        { type: 'Tab', memory: { workingSetSize: 25_600, peakWorkingSetSize: 40_000 } },
      ],
      mainMemory: {
        rss: 100 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024,
        heapTotal: 64 * 1024 * 1024,
        external: 5 * 1024 * 1024,
      },
      activeResourceTypes: ['Timeout', 'Timeout', 'PipeWrap'],
      appEventListeners: { beforeQuit: 1, secondInstance: 1 },
    })

    expect(diagnostic).toEqual({
      electronProcesses: {
        total: 3,
        byType: { browser: 1, tab: 2 },
        totalWorkingSetMb: 175,
        largestPeakWorkingSetMb: 150,
      },
      mainProcessMemory: { rssMb: 100, heapUsedMb: 40, heapTotalMb: 64, externalMb: 5 },
      activeResources: { timeout: 2, 'pipe-wrap': 1 },
      appEventListeners: { 'before-quit': 1, 'second-instance': 1 },
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/pid|command/i)
  })

  it('clamps malformed or negative metric values to zero', () => {
    const diagnostic = createResourceDiagnostic({
      appMetrics: [{ type: 'Utility', memory: { workingSetSize: Number.NaN, peakWorkingSetSize: -1 } }],
      mainMemory: { rss: -1, heapUsed: Number.POSITIVE_INFINITY },
      activeResourceTypes: [],
      appEventListeners: { activate: -3 },
    })

    expect(diagnostic.electronProcesses.totalWorkingSetMb).toBe(0)
    expect(diagnostic.mainProcessMemory.rssMb).toBe(0)
    expect(diagnostic.appEventListeners.activate).toBe(0)
  })
})
