import { NextRequest } from 'next/server';
import { OpenRouterClient } from '@/lib/llm/openrouter';

/**
 * Test API route for OpenRouter integration
 * GET /api/test-llm - Test basic LLM functionality
 */
export async function GET(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        { 
          success: false, 
          error: 'OpenRouter API key not configured',
          details: 'Please set OPENROUTER_API_KEY in your environment variables'
        }, 
        { status: 500 }
      );
    }

    // Initialize OpenRouter client
    const client = new OpenRouterClient();
    
    // Test with simple "Hello World" prompt
    const testPrompt = 'Hello World! Please respond with a brief greeting.';
    const response = await client.generateResponse(testPrompt);

    return Response.json({
      success: true,
      model: client.getModel(),
      prompt: testPrompt,
      response: response,
      timestamp: new Date().toISOString(),
      configured: client.isConfigured()
    });

  } catch (error) {
    console.error('Test LLM API error:', error);
    
    // Return appropriate error response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return Response.json(
      { 
        success: false, 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for testing with custom prompts
 * POST /api/test-llm - Test with custom prompt
 */
export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        { 
          success: false, 
          error: 'OpenRouter API key not configured',
          details: 'Please set OPENROUTER_API_KEY in your environment variables'
        }, 
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { prompt, systemPrompt } = body;

    if (!prompt) {
      return Response.json(
        { 
          success: false, 
          error: 'Prompt is required',
          details: 'Please provide a prompt in the request body'
        }, 
        { status: 400 }
      );
    }

    // Initialize OpenRouter client
    const client = new OpenRouterClient();
    
    // Generate response
    let response: string;
    if (systemPrompt) {
      response = await client.generateResponseWithContext(systemPrompt, prompt);
    } else {
      response = await client.generateResponse(prompt);
    }

    return Response.json({
      success: true,
      model: client.getModel(),
      prompt: prompt,
      systemPrompt: systemPrompt || null,
      response: response,
      timestamp: new Date().toISOString(),
      configured: client.isConfigured()
    });

  } catch (error) {
    console.error('Test LLM API error:', error);
    
    // Return appropriate error response
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return Response.json(
      { 
        success: false, 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}
