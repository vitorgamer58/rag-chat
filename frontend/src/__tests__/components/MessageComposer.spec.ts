import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MessageComposer from '@/components/MessageComposer.vue'
import { useChatStore } from '@/stores/chat'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MessageComposer', () => {
  it('submits trimmed content and clears the textarea', async () => {
    const wrapper = mount(MessageComposer)
    const store = useChatStore()
    const sendMessage = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined)

    const textarea = wrapper.find('textarea')
    await textarea.setValue('  Hello world  ')
    await wrapper.find('form').trigger('submit')

    expect(sendMessage).toHaveBeenCalledWith('Hello world')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('does not submit blank content', async () => {
    const wrapper = mount(MessageComposer)
    const store = useChatStore()
    const sendMessage = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined)

    await wrapper.find('textarea').setValue('   ')
    await wrapper.find('form').trigger('submit')

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('disables the textarea and submit button while the store reports the chat as busy', async () => {
    const store = useChatStore()
    store.activeChatId = 'c1'
    // isComposerDisabled derives from activeMessages, so an in-flight assistant message is what drives it true.
    store.messagesByChat.set('c1', [
      {
        id: 'a1',
        chatId: 'c1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        sources: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        completedAt: null,
      },
    ])
    const wrapper = mount(MessageComposer)

    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('submits on Enter but not on Shift+Enter', async () => {
    const wrapper = mount(MessageComposer)
    const store = useChatStore()
    const sendMessage = vi.spyOn(store, 'sendMessage').mockResolvedValue(undefined)

    const textarea = wrapper.find('textarea')
    await textarea.setValue('line one')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(sendMessage).not.toHaveBeenCalled()

    await textarea.trigger('keydown', { key: 'Enter' })
    expect(sendMessage).toHaveBeenCalledWith('line one')
  })
})
