# LLM Module

This directory contains the LLM (Large Language Model) integration components for Clarifier.

## Modules

### `conversationLoop.ts`

The core conversation loop that powers Clarifier's two-phase conversation model.

**Main Function:**
```typescript
import { continueConversation } from '@/lib/llm/conversationLoop';

const response = await continueConversation({
  domain: 'business',
  conversationHistory: [
    { role: 'user', content: 'I want to start a business' },
    { role: 'assistant', content: 'What problem are you solving?' }
  ],
  userMessage: 'I want to help people find eco-friendly products',
  intensity: 'deep' // or 'basic'
});
```

**Features:**
- LangChain integration with OpenRouter
- Automatic retry with exponential backoff
- Domain-specific prompts
- Conversation history management
- Comprehensive error handling
- Input validation and sanitization

**Documentation:** See `/docs/api/langchain-conversation-loop.md`

**Tests:** `/__tests__/lib/conversationLoop.test.ts` (27 tests, 95% coverage)

### `openrouter.ts`

Direct OpenRouter API integration (legacy, use `conversationLoop.ts` instead).

## Environment Variables

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-...
```

## Testing

```bash
# Run conversation loop tests
npm test -- __tests__/lib/conversationLoop.test.ts

# Run with coverage
npm test -- __tests__/lib/conversationLoop.test.ts --coverage
```

## Quick Start

1. Set up environment variables:
   ```bash
   echo "OPENROUTER_API_KEY=sk-or-v1-..." >> .env.local
   ```

2. Import and use:
   ```typescript
   import { continueConversation } from '@/lib/llm/conversationLoop';
   
   const response = await continueConversation({
     domain: 'business',
     conversationHistory: [],
     userMessage: 'Tell me about your business idea',
   });
   ```

3. Handle errors:
   ```typescript
   import { 
     continueConversation, 
     ValidationError, 
     ConversationError 
   } from '@/lib/llm/conversationLoop';
   
   try {
     const response = await continueConversation(params);
   } catch (error) {
     if (error instanceof ValidationError) {
       console.error('Invalid input:', error.message);
     } else if (error instanceof ConversationError) {
       console.error('LLM error:', error.code);
     }
   }
   ```

## Supported Domains

- `business` - Business strategy and planning
- `product` - Product development and features
- `creative` - Creative writing and storytelling
- `research` - Research projects and methodology
- `coding` - Software development and architecture

## Intensity Levels

- `basic` - Gentle, approachable questioning for beginners
- `deep` - Intensive, expert-level questioning for thorough exploration

## Performance

- **Target Response Time:** < 10 seconds
- **Max Conversation History:** 10 messages
- **Max Message Length:** 5000 characters
- **Retry Attempts:** 3 with exponential backoff

## Error Codes

- `MISSING_API_KEY` - OPENROUTER_API_KEY not configured
- `AUTH_ERROR` - Authentication failed
- `API_ERROR` - API validation error
- `EMPTY_RESPONSE` - LLM returned empty response
- `MAX_RETRIES_EXCEEDED` - Failed after maximum retries
- `UNKNOWN_ERROR` - Unexpected error

## Best Practices

1. **Always validate input before calling:**
   ```typescript
   if (!userMessage.trim()) {
     throw new Error('Message cannot be empty');
   }
   ```

2. **Use appropriate intensity:**
   ```typescript
   const intensity = user.isExperienced ? 'deep' : 'basic';
   ```

3. **Handle errors gracefully:**
   ```typescript
   try {
     const response = await continueConversation(params);
   } catch (error) {
     return fallbackResponse;
   }
   ```

4. **Store conversation history:**
   ```typescript
   await saveToDatabase({
     role: 'assistant',
     content: response
   });
   ```

## Troubleshooting

### "OPENROUTER_API_KEY not set"
Add the API key to `.env.local`:
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

### "Invalid domain"
Use one of the supported domains:
```typescript
const validDomains = ['business', 'product', 'creative', 'research', 'coding'];
```

### "User message exceeds maximum length"
Trim message to 5000 characters:
```typescript
const trimmedMessage = userMessage.slice(0, 5000);
```

### "Failed after 3 retry attempts"
- Check OpenRouter service status
- Verify API key is valid
- Check network connectivity
- Fallback response is automatically returned

## Further Reading

- [Full API Documentation](/docs/api/langchain-conversation-loop.md)
- [Implementation Summary](/openspec/changes/implement-langchain-conversation-loop/IMPLEMENTATION_SUMMARY.md)
- [LangChain Documentation](https://js.langchain.com/)
- [OpenRouter Documentation](https://openrouter.ai/docs)

