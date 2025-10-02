import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center text-red-600">
            Authentication Error
          </CardTitle>
          <CardDescription className="text-center">
            There was an error confirming your account. This could be due to an expired or invalid confirmation link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600">
            <p>Please try the following:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Check if the confirmation link has expired</li>
              <li>Make sure you clicked the most recent confirmation email</li>
              <li>Try signing up again if the link is no longer valid</li>
            </ul>
          </div>
          <div className="flex flex-col space-y-2">
            <Button asChild>
              <Link href="/signup">Try signing up again</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">Go to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
