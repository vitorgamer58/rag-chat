import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UserIdentity from '@/components/UserIdentity.vue'

const FINGERPRINT = 'a1b2c3d4e5f60718293a4b5c6d7e9f8e'

vi.mock('@/composables/useFingerprint', () => ({
  getFingerprint: () => Promise.resolve(FINGERPRINT),
}))

// jsdom has no canvas implementation, so the identicon itself is faked.
const createIcon = vi.fn<(opts: unknown) => { toDataURL: () => string }>(() => ({
  toDataURL: () => 'data:image/png;base64,fake',
}))
vi.mock('@download/blockies', () => ({ createIcon: (opts: unknown) => createIcon(opts) }))

describe('UserIdentity', () => {
  it('shows the truncated fingerprint, with the full value on hover', async () => {
    const wrapper = mount(UserIdentity)
    await flushPromises()

    expect(wrapper.text()).toBe('a1b2c3…9f8e')
    expect(wrapper.attributes('title')).toBe(FINGERPRINT)
  })

  it('renders a Blockies avatar seeded with the fingerprint', async () => {
    const wrapper = mount(UserIdentity)
    await flushPromises()

    expect(createIcon).toHaveBeenCalledWith(expect.objectContaining({ seed: FINGERPRINT }))
    expect(wrapper.find('img.avatar').attributes('src')).toBe('data:image/png;base64,fake')
  })
})
