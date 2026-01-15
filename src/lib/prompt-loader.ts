/**
 * Prompt Loader Utility
 * Loads prompt templates from /prompts directory and replaces variables
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * Load a prompt template and replace variables
 * @param name - The prompt file name (without .md extension)
 * @param variables - Key-value pairs to replace {{variable}} placeholders
 * @returns The processed prompt string
 */
export function loadPrompt(
  name: string,
  variables?: Record<string, string>
): string {
  // Resolve path to prompts directory (relative to project root)
  const promptsDir = path.resolve(process.cwd(), 'prompts')
  const filePath = path.join(promptsDir, `${name}.md`)

  // Read the prompt file
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`)
  }

  let content = fs.readFileSync(filePath, 'utf-8')

  // Replace variables if provided
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      // Replace all occurrences of {{key}} with value
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      content = content.replace(pattern, value ?? '')
    }
  }

  return content
}

/**
 * Load a prompt with validation that all variables are replaced
 * @param name - The prompt file name (without .md extension)
 * @param variables - Key-value pairs to replace {{variable}} placeholders
 * @returns The processed prompt string
 * @throws Error if any {{variable}} placeholders remain unreplaced
 */
export function loadPromptStrict(
  name: string,
  variables?: Record<string, string>
): string {
  const content = loadPrompt(name, variables)

  // Check for any remaining unreplaced variables
  const remainingVars = content.match(/\{\{[^}]+\}\}/g)
  if (remainingVars) {
    throw new Error(
      `Unreplaced variables in prompt "${name}": ${remainingVars.join(', ')}`
    )
  }

  return content
}
