import { createFileRoute } from '@tanstack/react-router'

import { PlainPage } from '@/components/shell/PlainPage'

export const Route = createFileRoute('/terms')({ component: Terms })

function Terms() {
  return (
    <PlainPage
      title="Terms"
      parts={[
        {
          heading: 'What this is',
          lines: [
            'Solo Leveling is a personal app built and used by one person, Artem Chernii, to keep track of his own days and money. It is not a product, and it is not offered to anyone else.',
          ],
        },
        {
          heading: 'Who may use it',
          lines: [
            'Only its owner. There is no sign-up. If you have reached this page from a bank’s consent screen and you are not him, do not continue.',
          ],
        },
        {
          heading: 'Bank connections',
          lines: [
            'When a bank account is connected, the app reads its balances and transactions with the owner’s consent, through Enable Banking. It reads only: it cannot move money or make payments.',
          ],
        },
        {
          heading: 'No promises',
          lines: [
            'The numbers shown are the owner’s own records for his own use. They are not advice, and nothing here is guaranteed to be complete or correct.',
          ],
        },
      ]}
    />
  )
}
