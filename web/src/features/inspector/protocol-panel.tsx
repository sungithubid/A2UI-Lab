import { useEffect, useId, useRef, useState } from 'react'
import { Braces } from 'lucide-react'
import { describe } from '@/lib/a2ui'
import type { LabEvent } from '@/lib/events'
import { Inspector } from './inspector'
const key = 'a2ui-lab.inspector-split'
const defaultSplit = 28
const clamp = (value: number) => Math.max(20, Math.min(70, value))
function initialSplit() {
  try {
    const stored = localStorage.getItem(key)
    const value = stored === null ? defaultSplit : Number(stored)
    return Number.isFinite(value) ? clamp(value) : defaultSplit
  } catch {
    return defaultSplit
  }
}
export function ProtocolPanel({
  visible,
  events,
  selected,
  onSelect,
}: {
  visible: LabEvent[]
  events: LabEvent[]
  selected?: LabEvent
  onSelect: (seq: number) => void
}) {
  const [split, setSplit] = useState(initialSplit),
    container = useRef<HTMLDivElement>(null),
    drag = useRef<{ y: number; split: number; height: number } | null>(null),
    listID = useId()
  useEffect(() => {
    try {
      localStorage.setItem(key, String(split))
    } catch {
      /* Layout remains adjustable without storage. */
    }
  }, [split])
  return (
    <section className="panel protocol-panel">
      <div className="panel-title">
        <h2>Protocol Inspector</h2>
        <Braces size={16} />
      </div>
      <div
        ref={container}
        className="inspector-split"
        style={{ gridTemplateRows: `${split}fr 10px ${100 - split}fr` }}
      >
        <div className="protocol-list" id={listID}>
          {visible
            .filter((e) => e.kind === 'a2ui.message')
            .map((e) => (
              <button
                className={selected?.seq === e.seq ? 'selected' : ''}
                key={e.seq}
                onClick={() => onSelect(e.seq)}
              >
                #{e.seq} <span>{describe(e.payload).type}</span>
              </button>
            ))}
        </div>
        <div
          className="inspector-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize protocol event list"
          aria-orientation="horizontal"
          aria-controls={listID}
          aria-valuemin={20}
          aria-valuemax={70}
          aria-valuenow={Math.round(split)}
          aria-valuetext={`${Math.round(split)}% event list`}
          title="Drag to resize. Up/Down to adjust; Home/End for limits. Double-click to reset."
          onDoubleClick={() => setSplit(defaultSplit)}
          onKeyDown={(e) => {
            const next = { ArrowUp: split - 5, ArrowDown: split + 5, Home: 20, End: 70 }[e.key]
            if (next !== undefined) {
              e.preventDefault()
              setSplit(clamp(next))
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || !container.current) return
            e.preventDefault()
            e.currentTarget.focus()
            drag.current = {
              y: e.clientY,
              split,
              height: container.current.getBoundingClientRect().height - 10,
            }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            const start = drag.current
            setSplit(clamp(start.split + ((e.clientY - start.y) * 100) / Math.max(1, start.height)))
          }}
          onPointerUp={(e) => {
            drag.current = null
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
          onLostPointerCapture={() => {
            drag.current = null
          }}
        >
          <span />
        </div>
        <div className="panel-scroll inspector">
          <Inspector event={selected} events={events} />
        </div>
      </div>
    </section>
  )
}
