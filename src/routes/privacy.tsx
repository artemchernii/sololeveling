import { createFileRoute } from '@tanstack/react-router'

import { PlainPage } from '@/components/shell/PlainPage'

export const Route = createFileRoute('/privacy')({ component: Privacy })

function Privacy() {
  return (
    <PlainPage
      title="Privacy"
      parts={[
        {
          heading: 'Who this is',
          lines: [
            'Solo Leveling is a personal app built and used by one person, Artem Chernii. It has one account: his. Nobody else can sign up, and it is not offered to anyone as a service.',
          ],
        },
        {
          heading: 'What is kept',
          lines: [
            'His own notes, tasks, calendar and money records. For money: account balances, transactions, and holdings — typed by him, read from statements and screenshots he drops in, or, when he connects a bank, read from that bank with his consent through Enable Banking, a licensed account information provider.',
            'No bank password or card number is ever seen or kept by the app. Consent is given in the bank’s own app and can be withdrawn there at any time.',
          ],
        },
        {
          heading: 'Where it is',
          lines: [
            'The data is stored in his own Convex database. Sign-in is handled by Clerk. Statements and screenshots he drops in are read by Anthropic’s Claude and the files are deleted after 90 days. The app runs on Cloudflare.',
            'Nothing is sold, shared, or used for advertising. There is no analytics on other people, because there are no other people.',
          ],
        },
        {
          heading: 'Removing it',
          lines: [
            'As the only user, he can delete any record, disconnect a bank, or delete the whole database at any time.',
          ],
        },
      ]}
    />
  )
}
