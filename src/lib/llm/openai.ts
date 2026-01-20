/**
 * OpenAI (GPT) LLM Adapter
 */

import OpenAI from 'openai'
import type {
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ChatOptions,
} from './types'
import { DEFAULT_MODELS } from './types'

export class OpenAIClient implements LLMClient {
  provider = 'openai' as const
  private client: OpenAI
  private defaultModel: string

  constructor(apiKey: string, defaultModel?: string) {
    this.client = new OpenAI({ apiKey })
    this.defaultModel = defaultModel || DEFAULT_MODELS.openai
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      stop: options?.stopSequences,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const choice = response.choices[0]
    if (!choice?.message?.content) {
      throw new Error('No response from OpenAI')
    }

    return {
      content: choice.message.content,
      model: response.model,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      finishReason:
        choice.finish_reason === 'stop'
          ? 'stop'
          : choice.finish_reason === 'length'
          ? 'length'
          : choice.finish_reason === 'content_filter'
          ? 'content_filter'
          : 'stop',
    }
  }

  async *chatStream(
    messages: LLMMessage[],
    options?: ChatOptions
  ): AsyncIterable<LLMStreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      stop: options?.stopSequences,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      const done = chunk.choices[0]?.finish_reason !== null

      if (content) {
        yield { content, done: false }
      }

      if (done) {
        yield { content: '', done: true }
      }
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      // Make a minimal API call to validate the key
      await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      return true
    } catch (error) {
      console.error('OpenAI API key validation failed:', error)
      return false
    }
  }
}
