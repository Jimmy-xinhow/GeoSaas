export function extractHeadings(md: string): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = [];
  const regex = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/-+$/, '');
    headings.push({ id, text, level: match[1].length });
  }
  return headings;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function markdownToHtml(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      return `<pre class="bg-black/50 text-gray-100 rounded-lg p-4 overflow-x-auto my-4 border border-white/10"><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
    })
    .replace(/`([^`]+)`/g, (_match, code) => `<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm text-gray-200">${escapeHtml(code)}</code>`)
    .replace(/\|(.+)\|/gm, (match) => {
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return '';
      return `<tr>${cells.map((c) => `<td class="border border-white/10 px-3 py-2 text-sm text-gray-300">${c}</td>`).join('')}</tr>`;
    })
    .replace(/^### (.+)$/gm, (_match, text) => {
      const id = text.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-');
      return `<h3 id="${id}" class="text-lg font-bold text-white mt-8 mb-3">${text}</h3>`;
    })
    .replace(/^## (.+)$/gm, (_match, text) => {
      const id = text.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-');
      return `<h2 id="${id}" class="text-xl font-bold text-white mt-10 mb-4">${text}</h2>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ml-6 list-decimal text-gray-300">$2</li>')
    .replace(/^-\s+(.+)$/gm, '<li class="ml-6 list-disc text-gray-300">$1</li>')
    .replace(/^>\s+(.+)$/gm, '<blockquote class="border-l-4 border-blue-400 pl-4 py-2 my-4 text-gray-400 italic">$1</blockquote>')
    .replace(/^---$/gm, '<hr class="my-8 border-white/10"/>')
    .replace(/^(?!<[a-z])([\s\S]+?)(?=\n\n|$)/gm, (match) => {
      const trimmed = match.trim();
      if (!trimmed || trimmed.startsWith('<')) return trimmed;
      return `<p class="text-gray-300 leading-relaxed mb-4">${trimmed}</p>`;
    })
    .replace(/<p[^>]*><\/p>/g, '');
}
