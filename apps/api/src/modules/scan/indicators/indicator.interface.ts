import * as cheerio from 'cheerio';

export interface IndicatorResult {
  score: number; // 0-100
  status: 'pass' | 'warning' | 'fail';
  details: Record<string, any>;
  suggestion?: string;
  autoFixable: boolean;
  generatedCode?: string;
}

export interface IIndicatorAnalyzer {
  name: string;
  analyze(data: AnalysisInput): Promise<IndicatorResult>;
}

export interface AnalysisInput {
  url: string;
  html: string;
  $: cheerio.CheerioAPI;
  headers: Record<string, string>;
  llmsTxt?: string | null;
  robotsTxt?: string | null;
}
