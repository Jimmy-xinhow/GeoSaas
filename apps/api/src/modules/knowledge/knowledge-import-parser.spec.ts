import { buildKnowledgeXlsx, KnowledgeExportQa } from './knowledge-xlsx.util';
import {
  extractKnowledgeText,
  extractStructuredKnowledgeItems,
  KnowledgeImportUpload,
} from './knowledge-import-parser';

function makeQa(index: number, category = `分類 ${index}`): KnowledgeExportQa {
  return {
    id: `qa-${index}`,
    question: `問題 ${index}？`,
    answer: `答案 ${index}`,
    category,
    sortOrder: index - 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeUpload(qas: KnowledgeExportQa[]): KnowledgeImportUpload {
  const buffer = buildKnowledgeXlsx(qas);
  return {
    originalname: 'faq.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

describe('knowledge FAQ XLSX format', () => {
  it('exports and imports the #, 分類, 問題, 答案 format without AI transformation', () => {
    const upload = makeUpload([
      makeQa(1, 'iPhone 18'),
      makeQa(2, '平台價值'),
    ]);

    const text = extractKnowledgeText(upload);
    const structured = extractStructuredKnowledgeItems(upload);

    expect(text.text.split('\n')[0]).toBe('# | 分類 | 問題 | 答案');
    expect(structured).toEqual({
      items: [
        { question: '問題 1？', answer: '答案 1', category: 'iPhone 18', rowNumber: 2 },
        { question: '問題 2？', answer: '答案 2', category: '平台價值', rowNumber: 3 },
      ],
      warnings: [],
    });
  });

  it('supports the full 200-item knowledge-base limit', () => {
    const upload = makeUpload(Array.from({ length: 200 }, (_, index) => makeQa(index + 1)));

    expect(extractStructuredKnowledgeItems(upload)?.items).toHaveLength(200);
  });
});
