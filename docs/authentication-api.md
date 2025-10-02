# Authentication API Documentation

## Overview

The Clarifier application uses Supabase Auth for user authentication, providing secure email/password authentication with session management.

## Authentication Context

### `AuthProvider`

The `AuthProvider` component provides authentication state and functions throughout the application.

```tsx
import { AuthProvider } from '@/lib/auth/context'

function App() {
  return (
    <AuthProvider>
      {/* Your app components */}
    </AuthProvider>
  )
}
```

### `useAuth` Hook

Access authentication state and functions in any component:

```tsx
import { useAuth } from '@/lib/auth/context'

function MyComponent() {
  const { user, loading, signOut } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!user) return <div>Please log in</div>
  
  return (
    <div>
      <p>Welcome, {user.email}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
```

## Authentication Functions

### `loginUser(formData: LoginFormData): Promise<AuthResult>`

Authenticates a user with email and password.

**Parameters:**
- `formData.email: string` - User's email address
- `formData.password: string` - User's password

**Returns:**
```typescript
interface AuthResult {
  success: boolean
  error?: AuthError
  data?: {
    user: User | null
    session: Session | null
  }
}
```

**Example:**
```typescript
import { loginUser } from '@/lib/auth/auth'

const result = await loginUser({
  email: 'user@example.com',
  password: 'password123'
})

if (result.success) {
  console.log('User logged in:', result.data?.user)
} else {
  console.error('Login failed:', result.error?.message)
}
```

### `signupUser(formData: SignupFormData): Promise<AuthResult>`

Creates a new user account with email and password.

**Parameters:**
- `formData.email: string` - User's email address
- `formData.password: string` - User's password
- `formData.confirmPassword: string` - Password confirmation

**Returns:** Same as `loginUser`

**Example:**
```typescript
import { signupUser } from '@/lib/auth/auth'

const result = await signupUser({
  email: 'user@example.com',
  password: 'password123',
  confirmPassword: 'password123'
})

if (result.success) {
  console.log('User created:', result.data?.user)
} else {
  console.error('Signup failed:', result.error?.message)
}
```

### `logoutUser(): Promise<AuthResult>`

Signs out the current user and clears the session.

**Returns:** Same as `loginUser`

**Example:**
```typescript
import { logoutUser } from '@/lib/auth/auth'

const result = await logoutUser()

if (result.success) {
  console.log('User signed out')
} else {
  console.error('Logout failed:', result.error?.message)
}
```

## Form Validation Schemas

### Login Schema

```typescript
import { loginSchema } from '@/lib/auth/schemas'

const formData = {
  email: 'user@example.com',
  password: 'password123'
}

const validation = loginSchema.safeParse(formData)
if (!validation.success) {
  console.error('Validation errors:', validation.error.issues)
}
```

### Signup Schema

```typescript
import { signupSchema } from '@/lib/auth/schemas'

const formData = {
  email: 'user@example.com',
  password: 'password123',
  confirmPassword: 'password123'
}

const validation = signupSchema.safeParse(formData)
if (!validation.success) {
  console.error('Validation errors:', validation.error.issues)
}
```

## Route Protection

### `AuthGuard` Component

Protects routes that require authentication:

```tsx
import { AuthGuard } from '@/components/AuthGuard'

function ProtectedPage() {
  return (
    <AuthGuard>
      <div>This content is only visible to authenticated users</div>
    </AuthGuard>
  )
}
```

### Middleware Protection

Server-side route protection is handled by `middleware.ts`:

```typescript
// Protected routes
const protectedRoutes = ['/dashboard', '/profile', '/settings']

// Public routes that redirect authenticated users
const authRoutes = ['/login', '/signup']
```

## Error Handling

### Error Types

```typescript
interface AuthError {
  message: string
  code?: string
}
```

### Common Error Messages

- `Invalid email or password` - Invalid login credentials
- `An account with this email already exists` - Email already registered
- `Password must be at least 6 characters long` - Password too short
- `Please enter a valid email address` - Invalid email format
- `An unexpected error occurred. Please try again.` - Generic error

### Error Handling Example

```typescript
const result = await loginUser(formData)

if (!result.success) {
  switch (result.error?.code) {
    case 'Invalid login credentials':
      setError('Invalid email or password')
      break
    case 'Too many requests':
      setError('Too many login attempts. Please try again later.')
      break
    default:
      setError(result.error?.message || 'Login failed')
  }
}
```

## Security Considerations

1. **Password Requirements**: Minimum 6 characters (enforced by Supabase)
2. **Email Verification**: Required for new accounts
3. **Session Management**: Automatic session refresh and cleanup
4. **Rate Limiting**: Handled by Supabase Auth
5. **CSRF Protection**: Built into Supabase Auth
6. **Secure Cookies**: Used for session storage

## Database Integration

### Profile Creation

When a user signs up, a profile record is automatically created in the `profiles` table:

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  usage_count INT DEFAULT 0,
  tier TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS)

The `profiles` table is protected by RLS policies:

- Users can only read their own profile
- Users can only update their own profile
- Only authenticated users can insert profiles

## Testing

### Unit Tests

Run unit tests for authentication functions:

```bash
npm test
```

### Integration Tests

Run integration tests for complete authentication flows:

```bash
npm run test:coverage
```

### Test Coverage

The authentication module maintains 80%+ test coverage including:
- Authentication function success/failure scenarios
- Error handling and retry mechanisms
- Form validation
- Component behavior
- Integration flows

## Troubleshooting

### Common Issues

1. **Profile Creation Fails**: Check database connection and RLS policies
2. **Session Not Persisting**: Verify middleware configuration
3. **Redirect Loops**: Check route protection logic
4. **Form Validation Errors**: Ensure proper schema validation

### Debug Mode

Enable debug logging by setting `NODE_ENV=development`:

```bash
NODE_ENV=development npm run dev
```

This will log detailed authentication events to the console.
