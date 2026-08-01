import { describe, expect, it } from 'vitest'

import { NO_UPDATE_CHANNEL, resolveUpdateChannel } from './live-update'

/**
 * Regression cover for #193 — F-Droid lost its update channel after an OTA
 * reload.
 *
 * The channel is baked into the bundle at build time, so it is a property of
 * the RUNNING bundle, not of the installed app. After an OTA reload the running
 * bundle is the downloaded one; if CI built it without `VITE_UPDATE_CHANNEL`,
 * the value is simply gone and the platform fallback takes over.
 */
describe('resolveUpdateChannel', () => {
  it('uses the channel baked into the bundle', () => {
    expect(resolveUpdateChannel('android-foss', 'android')).toBe('android-foss')
    expect(resolveUpdateChannel('ios', 'ios')).toBe('ios')
  })

  it('keeps the no-update sentinel, so Play never self-updates', () => {
    expect(resolveUpdateChannel(NO_UPDATE_CHANNEL, 'android')).toBe(NO_UPDATE_CHANNEL)
  })

  it('falls back to the platform when the bundle carries no channel', () => {
    expect(resolveUpdateChannel(undefined, 'ios')).toBe('ios')
    expect(resolveUpdateChannel('', 'android')).toBe('android')
  })

  it('documents why the fallback is not good enough for F-Droid', () => {
    // `ios` and `android` survive the fallback only because they happen to be
    // spelled like their platform. `android-foss` is not — this is exactly the
    // wrong-channel bug: an F-Droid install would poll the Play channel.
    expect(resolveUpdateChannel(undefined, 'android')).not.toBe('android-foss')
    expect(resolveUpdateChannel(undefined, 'android')).toBe('android')
  })
})

/**
 * The behavioural fix lives in the build, not here: every OTA bundle must carry
 * its own channel. `.github/workflows/deploy-prototypes.yml` builds per channel
 * and asserts the sentinel afterwards — a unit test cannot see a Vite define,
 * so that assertion is the other half of this regression cover.
 */
describe('channel names', () => {
  it('has exactly one channel that the platform fallback cannot reproduce', () => {
    const channels = ['ios', 'android', 'android-foss']
    const platforms = ['ios', 'android']
    const unreachable = channels.filter((c) => !platforms.includes(c))
    expect(unreachable).toEqual(['android-foss'])
  })
})
