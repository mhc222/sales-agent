/**
 * LLM Client Factory
 * Creates the appropriate LLM client based on provider configuration
 */

import type { LLMClient, LLMConfig, LLMProvider } from './types'
import { AnthropicClient } from './anthropic'
import { OpenAIClient } from './openai'
import { GoogleClient } from './google'

/**
 * Create an LLM client for the specified provider
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config.apiKey, config.model)
    case 'openai':
      return new OpenAIClient(config.apiKey, config.model)
    case 'google':
      return new GoogleClient(config.apiKey, config.model)
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`)
  }
}

/**
 * Validate an API key for a given provider
 */
export async function validateLLMApiKey(
  provider: LLMProvider,
  apiKey: string
): Promise<boolean> {
  try {
    const client = createLLMClient({ provider, apiKey })
    return await client.validateApiKey()
  } catch (error) {
    console.error(`API key validation failed for ${provider}:`, error)
    return false
  }
}
