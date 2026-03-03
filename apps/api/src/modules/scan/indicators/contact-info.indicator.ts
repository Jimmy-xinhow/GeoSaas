import { Injectable } from '@nestjs/common';
import { IIndicatorAnalyzer, IndicatorResult, AnalysisInput } from './indicator.interface';

@Injectable()
export class ContactInfoIndicator implements IIndicatorAnalyzer {
  name = 'contact_info';

  async analyze({ $, html }: AnalysisInput): Promise<IndicatorResult> {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(\+?\d{1,4}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const hasEmail = emailRegex.test(html);
    const hasPhone = phoneRegex.test(html);
    const hasAddress = $('[itemtype*="PostalAddress"]').length > 0 || html.includes('address');
    const hasContactSchema = html.includes('ContactPoint') || html.includes('contactPoint');

    let score = 0;
    if (hasEmail) score += 25;
    if (hasPhone) score += 25;
    if (hasAddress) score += 25;
    if (hasContactSchema) score += 25;

    return {
      score, status: score >= 70 ? 'pass' : score >= 40 ? 'warning' : 'fail',
      details: { hasEmail, hasPhone, hasAddress, hasContactSchema },
      suggestion: score < 100 ? '建議在頁面中明確提供聯絡 email、電話、地址，並使用 ContactPoint Schema 標記。' : undefined,
      autoFixable: false,
    };
  }
}
