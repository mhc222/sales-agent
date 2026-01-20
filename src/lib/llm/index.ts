/**
 * LLM Abstraction Layer
 *
 * Provides a unified interface for multiple LLM providers:
 * - Anthropic (Claude)
 * - OpenAI (GPT)
 * - Google (Gemini)
 *
 * Usage:
 * ```typescript
 * import { createLLMClient } from '@/src/lib/llm'
 *
 * const client = createLLMClient({
 *   provider: 'anthropic',
 *   apiKey: 'sk-...',
 * })
 *
 * const response = await client.chat([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' },
 * ])
 *
 * console.log(response.content)
 * ```
 */

// Types
export type {
  LLMProvider,
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  LLMClient,
  ChatOptions,
} from './types'

export {
  DEFAULT_MODELS,
  PROVIDER_NAMES,
  AVAILABLE_MODELS,
} from './types'

// Client factory
export { createLLMClient, validateLLMApiKey } from './client'

// Individual clients (for advanced use cases)
export { AnthropicClient } from './anthropic'
export { OpenAIClient } from './openai'
export { GoogleClient } from './google'
