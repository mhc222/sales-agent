/**
 * Anthropic (Claude) LLM Adapter
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ChatOptions,
} from './types'
import { DEFAULT_MODELS } from './types'

export class AnthropicClient implements LLMClient {
  provider = 'anthropic' as const
  private client: Anthropic
  private defaultModel: string

  constructor(apiKey: string, defaultModel?: string) {
    this.client = new Anthropic({ apiKey })
    this.defaultModel = defaultModel || DEFAULT_MODELS.anthropic
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    // Separate system message from conversation messages
    const systemMessage = messages.find((m) => m.role === 'system')
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    // Build request params
    const requestParams: Anthropic.MessageCreateParams = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      stop_sequences: options?.stopSequences,
      system: systemMessage?.content,
      messages: conversationMessages,
    }

    // Add extended thinking if requested
    if (options?.thinkingBudget) {
      (requestParams as Anthropic.MessageCreateParams & { thinking?: { type: string; budget_tokens: number } }).thinking = {
        type: 'enabled',
        budget_tokens: options.thinkingBudget,
      }
    }

    const response = await this.client.messages.create(requestParams)

    // Filter out thinking blocks, get only the text response
    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    return {
      content: textContent.text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'length',
    }
  }

  async *chatStream(
    messages: LLMMessage[],
    options?: ChatOptions
  ): AsyncIterable<LLMStreamChunk> {
    // Separate system message from conversation messages
    const systemMessage = messages.find((m) => m.role === 'system')
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const stream = this.client.messages.stream({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      stop_sequences: options?.stopSequences,
      system: systemMessage?.content,
      messages: conversationMessages,
    })

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield {
          content: event.delta.text,
          done: false,
        }
      }
    }

    yield { content: '', done: true }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      // Make a minimal API call to validate the key
      await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      return true
    } catch (error) {
      console.error('Anthropic API key validation failed:', error)
      return false
    }
  }
}
