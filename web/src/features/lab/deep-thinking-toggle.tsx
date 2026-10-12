import { Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DeepThinkingToggle({
  enabled,
  onChange,
  label,
  disabled,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="deep-thinking-switch"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
    >
      <Brain size={16} />
      Deep thinking<span>{enabled ? 'On' : 'Off'}</span>
    </Button>
  )
}
