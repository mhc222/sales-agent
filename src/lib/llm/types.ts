/**
 * LLM Abstraction Layer - Types
 * Unified interface for multiple LLM providers
 */

export type LLMProvider = 'anthropic' | 'openai' | 'google'

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model?: string // Optional model override, defaults per provider
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
  /**
   * Enable extended thinking (Anthropic-only feature)
   * When set, enables Claude's extended thinking with the specified token budget
   * Ignored for non-Anthropic providers
   */
  thinkingBudget?: number
}

export interface LLMResponse {
  content: string
  model: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls'
}

export interface LLMStreamChunk {
  content: string
  done: boolean
}

/**
 * Unified LLM Client interface
 * All provider adapters implement this interface
 */
export interface LLMClient {
  provider: LLMProvider

  /**
   * Send a chat completion request
   */
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>

  /**
   * Send a chat completion request with streaming response
   * Returns an async iterator that yields content chunks
   */
  chatStream(messages: LLMMessage[], options?: ChatOptions): AsyncIterable<LLMStreamChunk>

  /**
   * Validate that the API key is valid
   */
  validateApiKey(): Promise<boolean>
}

/**
 * Default models per provider
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-1.5-pro',
}

/**
 * Provider display names
 */
export const PROVIDER_NAMES: Record<LLMProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
}

/**
 * Available models per provider
 */
export const AVAILABLE_MODELS: Record<LLMProvider, { id: string; name: string }[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Recommended)' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (Most Capable)' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fastest)' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Recommended)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Faster/Cheaper)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  google: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Recommended)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Faster)' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)' },
  ],
}
