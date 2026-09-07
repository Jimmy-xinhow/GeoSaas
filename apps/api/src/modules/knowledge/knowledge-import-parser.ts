import { inflateRawSync } from 'zlib';

export interface KnowledgeImportUpload {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

export interface ExtractedKnowledgeText {
  text: string;
  sourceType: string;
  warnings: string[];
}

export interface StructuredKnowledgeItem {
  question: string;
  answer: string;
  category?: string;
  rowNumber: number;
}

export interface StructuredKnowledgeImport {
  items: StructuredKnowledgeItem[];
  warnings: string[];
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm']);
const MAX_SCAN_BACK = 66000;

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripXmlTags(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim();
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  if (buffer.length < 22) throw new Error('Invalid ZIP file.');

  const minOffset = Math.max(0, buffer.length - MAX_SCAN_BACK);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP file.');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const local = entry.localHeaderOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) continue;
    const nameLength = buffer.readUInt16LE(local + 26);
    const extraLength = buffer.readUInt16LE(local + 28);
    const dataStart = local + 30 + nameLength + extraLength;
    const compressed = buffer.slice(dataStart, dataStart + entry.compressedSize);
    if (entry.method === 0) files.set(entry.name, compressed);
    if (entry.method === 8) files.set(entry.name, inflateRawSync(compressed));
  }
  return files;
}

function extractDocxText(buffer: Buffer): string {
  const files = readZipEntries(buffer);
  const document = files.get('word/document.xml');
  if (!document) throw new Error('DOCX document.xml was not found.');
  return document
    .toString('utf8')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .split('\n')
    .map(stripXmlTags)
    .filter(Boolean)
    .join('\n');
}

function extractSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siMatches = xml.match(/<si[\s\S]*?<\/si>/g) ?? [];
  for (const si of siMatches) {
    const text = (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [])
      .map((part) => stripXmlTags(part))
      .join('');
    strings.push(text);
  }
  return strings;
}

function cellValue(cellXml: string, sharedStrings: string[]): string {
  const type = cellXml.match(/\st="([^"]+)"/)?.[1];
  if (type === 'inlineStr') {
    return (cellXml.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [])
      .map((part) => stripXmlTags(part))
      .join('');
  }
  const rawValue = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]?.trim() ?? '';
  if (type === 's') {
    const index = Number(rawValue);
    return Number.isFinite(index) ? sharedStrings[index] ?? '' : '';
  }
  return decodeXmlEntities(rawValue);
}

interface XlsxRow {
  rowNumber: number;
  cells: string[];
}

function columnIndexFromCellRef(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(0, index - 1);
}

function extractXlsxRows(buffer: Buffer): XlsxRow[] {
  const files = readZipEntries(buffer);
  const sharedStrings = files.get('xl/sharedStrings.xml')
    ? extractSharedStrings(files.get('xl/sharedStrings.xml')!.toString('utf8'))
    : [];
  const sheetNames = Array.from(files.keys())
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();
  if (sheetNames.length === 0) throw new Error('XLSX worksheet data was not found.');

  const parsedRows: XlsxRow[] = [];
  for (const sheetName of sheetNames) {
    const xml = files.get(sheetName)!.toString('utf8');
    const rows = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
    for (const row of rows) {
      const rowNumber = Number(row.match(/\br="(\d+)"/)?.[1] ?? parsedRows.length + 1);
      const cells: string[] = [];
      const cellMatches = row.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? [];
      for (const cell of cellMatches) {
        const cellRef = cell.match(/\br="([A-Z]+\d+)"/i)?.[1];
        const columnIndex = cellRef ? columnIndexFromCellRef(cellRef) : cells.length;
        cells[columnIndex] = cellValue(cell, sharedStrings).trim();
      }
      if (cells.some(Boolean)) parsedRows.push({ rowNumber, cells });
    }
  }
  return parsedRows;
}

function extractXlsxText(buffer: Buffer): string {
  return extractXlsxRows(buffer)
    .map((row) => row.cells.filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function findHeaderIndex(row: string[], aliases: Set<string>): number {
  return row.findIndex((value) => aliases.has(normalizeHeader(value || '')));
}

export function extractStructuredKnowledgeItems(
  file: KnowledgeImportUpload,
): StructuredKnowledgeImport | null {
  if (extensionOf(file.originalname) !== '.xlsx') return null;

  const rows = extractXlsxRows(file.buffer);
  const questionHeaders = new Set(['問題', 'question', 'q']);
  const answerHeaders = new Set(['答案', 'answer', 'a']);
  const categoryHeaders = new Set(['分類', '類別', 'category']);

  for (let headerOffset = 0; headerOffset < Math.min(rows.length, 25); headerOffset += 1) {
    const header = rows[headerOffset];
    const questionIndex = findHeaderIndex(header.cells, questionHeaders);
    const answerIndex = findHeaderIndex(header.cells, answerHeaders);
    if (questionIndex < 0 || answerIndex < 0) continue;

    const categoryIndex = findHeaderIndex(header.cells, categoryHeaders);
    const items: StructuredKnowledgeItem[] = [];
    const incompleteRows: number[] = [];

    for (const row of rows.slice(headerOffset + 1)) {
      const question = String(row.cells[questionIndex] ?? '').trim();
      const answer = String(row.cells[answerIndex] ?? '').trim();
      const category = categoryIndex >= 0
        ? String(row.cells[categoryIndex] ?? '').trim()
        : '';

      if (!question && !answer && !category) continue;
      if (!question || !answer) {
        incompleteRows.push(row.rowNumber);
        continue;
      }

      items.push({
        question,
        answer,
        category: category || undefined,
        rowNumber: row.rowNumber,
      });
    }

    const warnings = incompleteRows.length > 0
      ? [`已略過 ${incompleteRows.length} 筆缺少問題或答案的資料（列：${incompleteRows.slice(0, 10).join('、')}）。`]
      : [];
    return { items, warnings };
  }

  return null;
}

function decodeText(buffer: Buffer): string {
  const withoutBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
    ? buffer.slice(3)
    : buffer;
  return withoutBom.toString('utf8').replace(/\u0000/g, '').trim();
}

export function extractKnowledgeText(file: KnowledgeImportUpload): ExtractedKnowledgeText {
  const ext = extensionOf(file.originalname);
  const warnings: string[] = [];

  if (TEXT_EXTENSIONS.has(ext) || /^text\//.test(file.mimetype || '')) {
    return { text: decodeText(file.buffer), sourceType: ext.slice(1) || 'text', warnings };
  }

  if (ext === '.docx') {
    return { text: extractDocxText(file.buffer), sourceType: 'docx', warnings };
  }

  if (ext === '.xlsx') {
    warnings.push('XLSX import reads visible cell text only; formulas and formatting are ignored.');
    return { text: extractXlsxText(file.buffer), sourceType: 'xlsx', warnings };
  }

  if (ext === '.pdf') {
    throw new Error('PDF import is not supported yet. Please upload TXT, MD, CSV, JSON, DOCX, or XLSX.');
  }

  throw new Error('Unsupported file type. Please upload TXT, MD, CSV, JSON, DOCX, or XLSX.');
}
