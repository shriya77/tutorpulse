/**
 * Student hint assistant (F13): DeepSpace's ChatPanel, embedded. The server
 * scopes it to the student's live session, bills the app owner, caps turns
 * per session and never lets it state the answer (src/ai/chat-routes.ts,
 * src/ai/prompts/hint.ts). Hints render maths with KaTeX.
 */

import { useState } from 'react'
import { Button } from '@/components/ui'
import { ChatPanel, type ModelOption } from '../ChatPanel'

/** The server ignores the client's model choice; show the one it uses. */
const HINT_MODELS: ModelOption[] = [{ id: 'claude-haiku-5-5', label: 'Hint assistant', provider: 'anthropic' }]

const PROMPTS = ['How do I start this problem?', 'Which rule applies here?', 'Can you check my reasoning?']

export function HintPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Hint assistant" className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-medium text-foreground">Need a nudge?</h2>
          <p className="text-sm text-muted-foreground">The hint assistant guides you with questions. It won’t give you the answer.</p>
        </div>
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="hint-toggle">
          {open ? 'Close' : 'Hint'}
        </Button>
      </div>
      {open && (
        <div className="h-[28rem] border-t border-border" data-testid="hint-panel">
          <ChatPanel chatId={null} userId={userId} models={HINT_MODELS} emptyStatePrompts={PROMPTS} compact />
        </div>
      )}
    </section>
  )
}
