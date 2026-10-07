import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { reactive } from 'vue'
import MessageBubble from '@/components/MessageBubble.vue'
import { useChatStore } from '@/stores/chat'
import type { Message } from '@/types/message'

const baseMessage: Message = {
  id: 'm1',
  chatId: 'c1',
  role: 'assistant',
  content: '',
  status: 'done',
  sources: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MessageBubble', () => {
  it('renders Markdown assistant content as sanitized HTML', () => {
    const message: Message = { ...baseMessage, content: '**bold** and a list:\n\n- one\n- two' }
    const wrapper = mount(MessageBubble, { props: { message } })

    expect(wrapper.find('strong').exists()).toBe(true)
    expect(wrapper.find('strong').text()).toBe('bold')
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it('does not run user messages through Markdown, keeping raw text (incl. asterisks) as plain text', () => {
    const message: Message = { ...baseMessage, role: 'user', content: '**not bold**' }
    const wrapper = mount(MessageBubble, { props: { message } })

    expect(wrapper.find('strong').exists()).toBe(false)
    expect(wrapper.text()).toContain('**not bold**')
  })

  it('renders the live streaming buffer instead of the (still empty) message content', () => {
    const message: Message = { ...baseMessage, content: '', status: 'streaming' }
    const store = useChatStore()
    store.streaming.set(
      'm1',
      reactive({ text: 'partial answer', lastSeq: 1, status: 'streaming', eventSource: null }),
    )

    const wrapper = mount(MessageBubble, { props: { message } })
    expect(wrapper.text()).toContain('partial answer')
  })

  it('renders the failure message instead of content when the generation failed', () => {
    const message: Message = { ...baseMessage, status: 'failed' }
    const store = useChatStore()
    store.streaming.set(
      'm1',
      reactive({ text: '', lastSeq: 0, status: 'failed', errorMessage: 'Oops', eventSource: null }),
    )

    const wrapper = mount(MessageBubble, { props: { message } })
    expect(wrapper.text()).toContain('Oops')
  })

})
