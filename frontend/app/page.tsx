'use client'

import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { useAccountContext } from '@/components/account-provider'

export default function HomePage() {
  const { account } = useAccountContext()

  return (
    <div className="mx-auto max-w-3xl">
      <Heading>Welcome{account?.name ? `, ${account.name}` : ''}.</Heading>
      <Text className="mt-2">
        {{PROJECT_NAME}} is up and running. This is a starter shell — replace it with your app.
      </Text>
    </div>
  )
}
