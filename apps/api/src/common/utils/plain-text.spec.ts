import { toPlainText, toPlainTextExcerpt } from './plain-text';

describe('plain text normalization', () => {
  it('removes markdown and html from public excerpts', () => {
    expect(toPlainText('## 標題\n**重點** [官網](https://example.com) <b>內容</b>'))
      .toBe('標題 重點 官網 內容');
  });

  it('truncates without reintroducing markup', () => {
    expect(toPlainTextExcerpt('**1234567890**', 6)).toBe('12345…');
  });

  it('does not split an astral Unicode character at the truncation boundary', () => {
    const excerpt = toPlainTextExcerpt(`${'a'.repeat(158)}\u{1F4A1} trailing`, 160);

    expect(excerpt).toBe(`${'a'.repeat(158)}\u{1F4A1}\u2026`);
    expect([...excerpt]).toHaveLength(160);
  });
});
