/**
 * Tutor picks the Calc I week a session covers. The week's misconception list
 * (written by an experienced study-group leader) is then given to the clustering AI so group labels
 * use the same language the tutor already uses. Optional.
 */

import { useMutations } from 'deepspace'
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import type { Envelope, SessionData } from '../../actions/types'
import { TOPICS } from '../../lib/topics'

const NONE = 'none'

export function TopicPicker({ session }: { session: Envelope<SessionData> }) {
  const { ready, put } = useMutations<Partial<SessionData>>('sessions')
  return (
    <div className="grid gap-1.5 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgba(29,43,58,0.05)]" data-testid="topic-picker">
      <Label htmlFor={`topic-${session.recordId}`}>Topic (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Pick which week of Calc I this session covers, and the misconception groups will use that week’s list of common mistakes.
      </p>
      <Select
        value={session.data.topic || NONE}
        onValueChange={(v) => put(session.recordId, { topic: v === NONE ? '' : v })}
        disabled={!ready}
      >
        <SelectTrigger id={`topic-${session.recordId}`} className="w-full sm:w-[28rem]" data-testid="topic-trigger">
          <SelectValue placeholder="No topic" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No topic</SelectItem>
          {TOPICS.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
