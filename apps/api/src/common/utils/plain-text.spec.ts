import { toPlainText, toPlainTextExcerpt } from './plain-text';

describe('plain text normalization', () => {
  it('removes markdown and html from public excerpts', () => {
    expect(toPlainText('## 標題\n**重點** [官網](https://example.com) <b>內容</b>'))
      .toBe('標題 重點 官網 內容');
  });

  it('truncates without reintroducing markup', () => {
    expect(toPlainTextExcerpt('**1234567890**', 6)).toBe('12345…');
  });
});
