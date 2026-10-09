import type { components } from '@/generated/api'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Play } from 'lucide-react'
import { api, required } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Experiment } from './experiment'
export function LabPage() {
  const client = useQueryClient(),
    [id, setID] = useState(''),
    [scenario, setScenario] =
      useState<components['schemas']['Create']['scenarioId']>('server-health'),
    [prompt, setPrompt] = useState('Analyze server health')
  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: async () => required((await api.GET('/api/runs')).data).items,
  })
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => required((await api.GET('/api/scenarios')).data).items,
  })
  const create = useMutation({
    mutationFn: async () =>
      required((await api.POST('/api/runs', { body: { prompt, scenarioId: scenario } })).data),
    onSuccess: (r) => {
      setID(r.id)
      void client.invalidateQueries({ queryKey: ['runs'] })
    },
  })
  const remove = useMutation({
    mutationFn: async () =>
      api.DELETE('/api/runs/{id}', {
        params: { path: { id } },
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      setID('')
      void client.invalidateQueries({ queryKey: ['runs'] })
    },
  })
  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand">
          <FlaskConical />
          <div>
            <h1>A2UI Lab</h1>
            <p>STREAMING UI / ENGINEERING PLAYGROUND</p>
          </div>
        </div>
        <div className="mode-tags">
          <span>Deterministic</span>
          <span>A2UI v0.9.1</span>
          <span className="mock-tag">Mock · no API key</span>
        </div>
      </header>
      <section className="experiment-bar" aria-label="Experiment setup">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <label>
            Scenario
            <select
              aria-label="Scenario"
              value={scenario}
              onChange={(e) => {
                const next = e.target.value as typeof scenario
                setScenario(next)
                setPrompt(
                  {
                    'server-health': 'Analyze server health',
                    'streaming-text': 'Show a streaming answer',
                    'tool-error': 'Demonstrate a tool failure',
                    'image-card': 'Recommend an Agent UI resource',
                    'image-list': 'Find resources for building a local Agent UI lab',
                    'support-form': 'Help me open a support ticket',
                    'deployment-approval': 'Prepare a staging deployment for my review',
                  }[next],
                )
              }}
            >
              {(scenarios.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="prompt-label">
            Prompt
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={2000}
              required
            />
          </label>
          <Button type="submit" disabled={create.isPending || !scenarios.data}>
            <Play />
            {create.isPending ? 'Starting…' : 'New run'}
          </Button>
        </form>
        <label>
          Run history
          <select aria-label="Run history" value={id} onChange={(e) => setID(e.target.value)}>
            <option value="">Choose a persisted run</option>
            {runs.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.status} · {r.id.slice(0, 6)}
              </option>
            ))}
          </select>
        </label>
        {id && (
          <Button
            variant="ghost"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || runs.data?.find((r) => r.id === id)?.status === 'running'}
          >
            Delete run
          </Button>
        )}
      </section>
      <p className="scenario-description">
        {scenarios.data?.find((s) => s.id === scenario)?.description}
      </p>
      {(create.error || runs.error || scenarios.error || remove.error) && (
        <p role="alert" className="issue">
          <p className="scenario-description">
            {scenarios.data?.find((s) => s.id === scenario)?.description}
          </p>
          {(create.error || runs.error || scenarios.error || remove.error)?.message}
        </p>
      )}
      {id ? (
        <Experiment key={id} id={id} />
      ) : (
        <section className="welcome">
          <FlaskConical size={44} />
          <h2>Every UI has a story. Inspect every event.</h2>
          <p>
            Start a deterministic experiment, watch its UI form, inspect the protocol, then replay
            it from SQLite.
          </p>
          <div className="welcome-steps">
            <span>01 / Agent events</span>
            <span>02 / Presentation</span>
            <span>03 / A2UI surfaces</span>
            <span>04 / Actions & replay</span>
          </div>
        </section>
      )}
      <footer>
        LOCAL LAB · SQLite event history · Lab catalog v1 · Intent and Generative modes are planned
      </footer>
    </main>
  )
}
