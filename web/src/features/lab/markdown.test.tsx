import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Markdown } from './markdown'
it('renders streaming Markdown, code and GFM tables without raw HTML or unsafe URLs', () => {
  const { container, rerender } = render(<Markdown text={'## Answer\n\n**Stream'} />)
  expect(screen.getByRole('heading', { name: 'Answer' })).toBeInTheDocument()
  rerender(
    <Markdown
      text={
        '## Answer\n\n**Streaming**\n\n```js\nalert("example")\n```\n\n| A | B |\n|---|---|\n|1|2|\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert(1))\n\n![Remote](https://example.test/pixel)\n\n[Docs](https://a2ui.org/)'
      }
    />,
  )
  expect(container.querySelector('strong')).toHaveTextContent('Streaming')
  expect(container.querySelector('pre code')).toHaveTextContent('alert("example")')
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Bad' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('rel', 'noopener noreferrer')
})
