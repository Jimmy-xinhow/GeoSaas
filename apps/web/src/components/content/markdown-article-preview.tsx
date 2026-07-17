import type { ReactNode } from 'react'

interface MarkdownArticlePreviewProps {
  markdown: string
  className?: string
}

function renderInline(value: string): ReactNode[] {
  const parts = value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g)

  return parts.filter(Boolean).map((part, index) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={index} className="font-semibold text-white">{bold[1]}</strong>

    const code = part.match(/^`([^`]+)`$/)
    if (code) return <code key={index} className="rounded bg-white/10 px-1.5 py-0.5 text-[0.9em] text-blue-100">{code[1]}</code>

    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline underline-offset-4 hover:text-blue-200">
          {link[1]}
        </a>
      )
    }

    return part
  })
}

function startsBlock(line: string) {
  return /^(?:#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s*|```|---+$)/.test(line.trim())
}

export function MarkdownArticlePreview({ markdown, className = '' }: MarkdownArticlePreviewProps) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim()
    if (!line) {
      index += 1
      continue
    }

    const fence = line.match(/^```\s*([\w-]*)\s*$/)
    if (fence) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre key={`code-${index}`} className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs leading-6 text-gray-200">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const content = renderInline(heading[2])
      if (level === 1) blocks.push(<h1 key={`h1-${index}`} className="text-2xl font-bold leading-tight text-white sm:text-3xl">{content}</h1>)
      if (level === 2) blocks.push(<h2 key={`h2-${index}`} className="border-b border-white/10 pb-2 pt-4 text-xl font-bold leading-snug text-white">{content}</h2>)
      if (level === 3) blocks.push(<h3 key={`h3-${index}`} className="pt-2 text-lg font-semibold leading-snug text-white">{content}</h3>)
      if (level === 4) blocks.push(<h4 key={`h4-${index}`} className="pt-1 text-base font-semibold text-gray-100">{content}</h4>)
      index += 1
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      const orderedList = Boolean(ordered)
      const items: string[] = []
      while (index < lines.length) {
        const candidate = lines[index].trim().match(orderedList ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/)
        if (!candidate) break
        items.push(candidate[1])
        index += 1
      }
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)
      blocks.push(orderedList
        ? <ol key={`ol-${index}`} className="ml-6 list-decimal space-y-2 text-gray-300 marker:font-semibold marker:text-blue-300">{children}</ol>
        : <ul key={`ul-${index}`} className="ml-6 list-disc space-y-2 text-gray-300 marker:text-blue-300">{children}</ul>)
      continue
    }

    const quote = line.match(/^>\s*(.+)$/)
    if (quote) {
      blocks.push(
        <blockquote key={`quote-${index}`} className="border-l-4 border-blue-400/70 bg-blue-500/[0.06] px-4 py-3 text-gray-300">
          {renderInline(quote[1])}
        </blockquote>,
      )
      index += 1
      continue
    }

    if (/^---+$/.test(line)) {
      blocks.push(<hr key={`hr-${index}`} className="border-white/10" />)
      index += 1
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(
      <p key={`p-${index}`} className="text-[15px] leading-8 text-gray-300">
        {renderInline(paragraph.join(' '))}
      </p>,
    )
  }

  return <article className={`space-y-5 ${className}`}>{blocks}</article>
}
