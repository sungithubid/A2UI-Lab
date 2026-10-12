import { useId, useState } from 'react'
import { Brain, ChevronDown, LoaderCircle } from 'lucide-react'
import type { ThinkingBlock } from '@/lib/reasoning'
import { Markdown } from './markdown'

export function Thinking({ block }: { block: ThinkingBlock }) {
  const id = useId()
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const open = expanded ?? block.status !== 'completed'
  const label = {
    streaming: 'Thinking…',
    completed: 'Thinking complete',
    interrupted: 'Thinking interrupted',
    failed: 'Thinking failed',
    incomplete: 'Thinking incomplete',
  }[block.status]
  return (
    <section className="thinking-panel" aria-label="Thinking summary" data-status={block.status}>
      <button
        className="thinking-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setExpanded(!open)}
      >
        {block.status === 'streaming' ? (
          <LoaderCircle className="thinking-spinner" size={16} />
        ) : (
          <Brain size={16} />
        )}
        <span className="thinking-label">{label}</span>
        <span className="thinking-duration">{(block.durationMs / 1000).toFixed(1)}s</span>
        <span className="thinking-source">
          {block.source === 'mock_summary' ? 'MOCK' : 'MODEL SUMMARY'}
        </span>
        <ChevronDown className={open ? 'thinking-chevron open' : 'thinking-chevron'} size={15} />
      </button>
      <div id={id} className="thinking-content" hidden={!open}>
        <p className="thinking-caption">
          {block.source === 'mock_summary'
            ? 'A fixed Mock planning summary. No external model was called.'
            : 'Displayable summary supplied by the model adapter.'}
        </p>
        {block.text ? (
          <Markdown text={block.text} />
        ) : (
          <p className="thinking-caption">Waiting for summary content…</p>
        )}
      </div>
    </section>
  )
}
