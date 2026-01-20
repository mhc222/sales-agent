/**
 * Google (Gemini) LLM Adapter
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  LLMClient,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ChatOptions,
} from './types'
import { DEFAULT_MODELS } from './types'

export class GoogleClient implements LLMClient {
  provider = 'google' as const
  private client: GoogleGenerativeAI
  private defaultModel: string

  constructor(apiKey: string, defaultModel?: string) {
    this.client = new GoogleGenerativeAI(apiKey)
    this.defaultModel = defaultModel || DEFAULT_MODELS.google
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    const model = this.client.getGenerativeModel({
      model: options?.model || this.defaultModel,
    })

    // Extract system instruction from messages
    const systemMessage = messages.find((m) => m.role === 'system')
    const conversationMessages = messages.filter((m) => m.role !== 'system')

    // Convert messages to Gemini format
    const history = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const lastMessage = conversationMessages[conversationMessages.length - 1]

    // Start chat with history
    const chat = model.startChat({
      history: history as any,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        stopSequences: options?.stopSequences,
      },
      systemInstruction: systemMessage?.content,
    })

    const result = await chat.sendMessage(lastMessage.content)
    const response = result.response
    const text = response.text()

    return {
      content: text,
      model: options?.model || this.defaultModel,
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount || 0,
            outputTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
      finishReason: 'stop',
    }
  }

  async *chatStream(
    messages: LLMMessage[],
    options?: ChatOptions
  ): AsyncIterable<LLMStreamChunk> {
    const model = this.client.getGenerativeModel({
      model: options?.model || this.defaultModel,
    })

    // Extract system instruction from messages
    const systemMessage = messages.find((m) => m.role === 'system')
    const conversationMessages = messages.filter((m) => m.role !== 'system')

    // Convert messages to Gemini format
    const history = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const lastMessage = conversationMessages[conversationMessages.length - 1]

    // Start chat with history
    const chat = model.startChat({
      history: history as any,
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        stopSequences: options?.stopSequences,
      },
      systemInstruction: systemMessage?.content,
    })

    const result = await chat.sendMessageStream(lastMessage.content)

    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) {
        yield { content: text, done: false }
      }
    }

    yield { content: '', done: true }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' })
      await model.generateContent('Hi')
      return true
    } catch (error) {
      console.error('Google API key validation failed:', error)
      return false
    }
  }
}
