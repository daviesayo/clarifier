import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

/**
 * OpenRouter client utility for LLM operations
 * Provides unified access to multiple LLM models through OpenRouter API
 */
export class OpenRouterClient {
  private client: ChatOpenAI;

  constructor() {
    // Validate API key is present
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    this.client = new ChatOpenAI({
      model: 'google/gemini-2.5-flash',
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      temperature: 0.7,
    });
  }

  /**
   * Generate a response from the LLM
   * @param prompt - The input prompt
   * @returns Promise<string> - The generated response
   */
  async generateResponse(prompt: string): Promise<string> {
    try {
      const message = new HumanMessage(prompt);
      const response = await this.client.invoke([message]);
      return response.content as string;
    } catch (error) {
      console.error('OpenRouter API error:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          throw new Error('Invalid OpenRouter API key');
        }
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          throw new Error('OpenRouter rate limit exceeded');
        }
        if (error.message.includes('network') || error.message.includes('fetch')) {
          throw new Error('Network error connecting to OpenRouter');
        }
      }
      
      throw new Error(`OpenRouter API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a response with system context
   * @param systemPrompt - The system context/instructions
   * @param userPrompt - The user input
   * @returns Promise<string> - The generated response
   */
  async generateResponseWithContext(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const response = await this.client.invoke(messages);
      return response.content as string;
    } catch (error) {
      console.error('OpenRouter API error:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          throw new Error('Invalid OpenRouter API key');
        }
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          throw new Error('OpenRouter rate limit exceeded');
        }
        if (error.message.includes('network') || error.message.includes('fetch')) {
          throw new Error('Network error connecting to OpenRouter');
        }
      }
      
      throw new Error(`OpenRouter API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current model being used
   * @returns string - The model name
   */
  getModel(): string {
    return 'google/gemini-2.5-flash';
  }

  /**
   * Check if the client is properly configured
   * @returns boolean - True if properly configured
   */
  isConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }
}

// Export a singleton instance for convenience
export const openRouterClient = new OpenRouterClient();
