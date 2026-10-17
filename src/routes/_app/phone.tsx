import { createFileRoute } from '@tanstack/react-router'

import { PhoneWindow } from '@/components/notify/PhoneWindow'

/* N1 (15 Oct). Where notifications are turned on — opened on the iPhone
   from the bell's QR, or from the bell on the Mac. Not a sidebar entry
   (PLAN §3 lists eleven); the bell is the way in. */
export const Route = createFileRoute('/_app/phone')({
  component: Phone,
})

function Phone() {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-4 pt-2">
      <PhoneWindow />
    </div>
  )
}
