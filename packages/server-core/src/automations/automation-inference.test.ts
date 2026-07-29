import { expect, test } from 'bun:test'
import { parseAutomationInferenceJson } from './automation-inference.ts'

test('accepts a valid model draft but refuses confirmed or malformed model output', () => {
  expect(parseAutomationInferenceJson('{"kind":"scheduled","name":"Daily","trigger":{"type":"schedule","cadence":"cron","value":"0 9 * * *"},"execution":"summarize","permissionMode":"ask","retryLimit":2,"confirmed":false}')).toMatchObject({ kind: 'scheduled', confirmed: false })
  expect(parseAutomationInferenceJson('{"confirmed":true}')).toBeNull()
  expect(parseAutomationInferenceJson('not json')).toBeNull()
})
