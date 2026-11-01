import type { ReactElement } from 'react'
import type { Env } from './ui/context.tsx'
import type { BigKit } from './ui/Big.tsx'

export function BigPage({ env, kit }: { readonly env: Env; readonly kit: BigKit }): ReactElement {
  return <div>{env.lang}{kit.palette.length}</div>
}
