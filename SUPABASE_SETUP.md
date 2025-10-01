# Supabase Setup Guide

This guide explains how to set up and use Supabase with the Clarifier application.

## Prerequisites

1. **Supabase Account**: Create an account at [supabase.com](https://supabase.com)
2. **Supabase Project**: Create a new project in your Supabase dashboard
3. **Node.js 20+**: Ensure you have Node.js 20 or higher installed

## Setup Instructions

### 1. Get Supabase Credentials

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings > API**
4. Copy the following values:
   - **Project URL** (e.g., `https://your-project-ref.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Update `.env.local` with your actual Supabase credentials:
   ```bash
   # Replace with your actual values
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
   ```

### 3. Verify Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) and check the "Supabase Connection Test" component

4. Test the API endpoint:
   ```bash
   curl http://localhost:3000/api/test-supabase
   ```

## Usage

### Client-Side Usage

```typescript
import { createClient } from '@/lib/supabase/client'

// In a React component
const supabase = createClient()

// Get current user
const { data: { user }, error } = await supabase.auth.getUser()

// Sign up a new user
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})
```

### Server-Side Usage

```typescript
import { createClient } from '@/lib/supabase/server'

// In an API route or server component
const supabase = await createClient()

// Get current user (from cookies)
const { data: { user }, error } = await supabase.auth.getUser()

// Query database
const { data, error } = await supabase
  .from('your_table')
  .select('*')
```

## Security Notes

- ✅ **Public Keys Only**: Only the `anon` public key is used (safe for client-side)
- ✅ **Environment Variables**: Sensitive data is stored in `.env.local` (excluded from Git)
- ✅ **Server-Side Auth**: User sessions are managed server-side with cookies
- ✅ **Row Level Security**: Database access is controlled by RLS policies

## Troubleshooting

### Connection Issues

1. **Check Environment Variables**: Ensure `.env.local` has correct values
2. **Verify Supabase Project**: Make sure your project is active
3. **Check Network**: Ensure you have internet connectivity
4. **Review Console**: Check browser console for error messages

### Common Errors

- **"Auth session missing!"**: This is normal when not authenticated
- **"Invalid API key"**: Check your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **"Invalid URL"**: Check your `NEXT_PUBLIC_SUPABASE_URL`

### Getting Help

1. Check the [Supabase Documentation](https://supabase.com/docs)
2. Review the [Next.js Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
3. Check the browser console for detailed error messages

## Next Steps

Once Supabase is set up, you can:

1. **Set up Database Schema**: Create tables for users, sessions, and messages
2. **Configure Authentication**: Set up email/password or OAuth providers
3. **Implement Row Level Security**: Secure your data with RLS policies
4. **Add Real-time Features**: Enable real-time subscriptions for live updates

## Files Created

- `lib/supabase/client.ts` - Client-side Supabase client
- `lib/supabase/server.ts` - Server-side Supabase client
- `app/api/test-supabase/route.ts` - Connection test API endpoint
- `app/components/SupabaseTest.tsx` - Connection test component
- `.env.example` - Environment variables template
- `.env.local` - Your actual credentials (not in Git)
