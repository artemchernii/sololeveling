import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-center gap-[9px]">
          <span className="size-3.5 rounded-[4px] bg-lav-500" aria-hidden />
          <span className="text-[11px] font-medium tracking-[0.2em]">
            SOLO LEVELING
          </span>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  )
}
