import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import LoginForm from './login-form'

export default async function LoginPage() {
  const supabase = createServerComponentClient({ cookies })
  
  // Check if user is already logged in
  const { data: { session } } = await supabase.auth.getSession()
  
  if (session) {
    redirect('/app')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-gray-100">
      <div className="w-full max-w-md space-y-8 p-10 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">hbar.ink</h1>
          <p className="mt-2 text-sm text-gray-600">
            A beautiful, reliable personal writing tool
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
