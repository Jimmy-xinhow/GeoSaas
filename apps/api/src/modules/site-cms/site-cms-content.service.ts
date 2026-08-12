import { BadRequestException, Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { marked } from 'marked';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import sanitizeHtml from 'sanitize-html';

export type SiteCmsContentFormat = 'markdown' | 'html';

const ALLOWED_CSS_PROPERTIES = new Set([
  'background-color', 'border', 'border-bottom', 'border-color', 'border-left',
  'border-radius', 'border-right', 'border-style', 'border-top', 'border-width',
  'box-shadow', 'color', 'display', 'font-family', 'font-size', 'font-style',
  'font-weight', 'gap', 'grid-template-columns', 'height', 'justify-content',
  'letter-spacing', 'line-height', 'list-style', 'list-style-position',
  'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
  'max-height', 'max-width', 'min-height', 'min-width', 'object-fit', 'opacity',
  'overflow', 'padding', 'padding-bottom', 'padding-left', 'padding-right',
  'padding-top', 'text-align', 'text-decoration', 'text-transform',
  'vertical-align', 'white-space', 'width', 'word-break',
]);

const FORBIDDEN_CSS_VALUE = /(url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|behavior\s*:|-moz-binding|\\|<|>)/i;
const FORBIDDEN_SELECTOR = /(^|[\s>+~,])(html|body)(?=$|[\s>+~,.#:[\]])|:root|::?slotted|::?part/i;

@Injectable()
export class SiteCmsContentService {
  sanitizeContent(content: string, format: SiteCmsContentFormat): string {
    const trimmed = String(content || '').trim();
    if (format === 'markdown') return trimmed;
    return this.sanitizeRichHtml(trimmed);
  }

  sanitizeRichHtml(content: string): string {
    return sanitizeHtml(content, {
      allowedTags: [
        'p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 's',
        'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'img', 'figure',
        'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
      ],
      allowedAttributes: {
        '*': ['class'],
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
        th: ['colspan', 'rowspan', 'scope'],
        td: ['colspan', 'rowspan'],
      },
      allowedClasses: { '*': [/^[a-z][a-z0-9_-]{0,63}$/i] },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: { img: ['https'], a: ['http', 'https', 'mailto'] },
      allowProtocolRelative: false,
      disallowedTagsMode: 'discard',
      transformTags: {
        a: (_tagName, attribs) => {
          const { target, rel: _rel, ...safeAttributes } = attribs;
          return {
            tagName: 'a',
            attribs: target === '_blank'
              ? { ...safeAttributes, target: '_blank', rel: 'noopener noreferrer' }
              : safeAttributes,
          };
        },
        img: (_tagName, attribs) => ({
          tagName: 'img',
          attribs: { ...attribs, loading: attribs.loading === 'eager' ? 'eager' : 'lazy' },
        }),
      },
    }).trim();
  }

  sanitizeCss(css: string | null | undefined): string {
    const source = String(css || '').trim();
    if (!source) return '';
    let root: postcss.Root;
    try {
      root = postcss.parse(source, { from: undefined });
    } catch {
      throw new BadRequestException('自訂 CSS 格式無法解析，請檢查括號與分號。');
    }

    root.walkComments((comment) => { comment.remove(); });
    root.walkAtRules((rule) => { rule.remove(); });
    root.walkRules((rule) => {
      if (!rule.selector || FORBIDDEN_SELECTOR.test(rule.selector)) {
        rule.remove();
        return;
      }
      try {
        rule.selector = selectorParser((selectors) => {
          selectors.each((selector) => {
            selector.prepend(selectorParser.combinator({ value: ' ' }));
            selector.prepend(selectorParser.className({ value: 'cms-article-content' }));
          });
        }).processSync(rule.selector, { lossless: false });
      } catch {
        rule.remove();
      }
    });
    root.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();
      const value = declaration.value;
      if (
        !ALLOWED_CSS_PROPERTIES.has(property)
        || FORBIDDEN_CSS_VALUE.test(value)
        || (property === 'display' && !/^(block|inline|inline-block|flex|grid|none)$/i.test(value.trim()))
      ) declaration.remove();
    });
    root.walkRules((rule) => {
      if (!rule.nodes?.some((node) => node.type === 'decl')) rule.remove();
    });
    return root.toString().trim();
  }

  renderPreview(content: string, format: SiteCmsContentFormat, customCss?: string) {
    const cleanContent = this.sanitizeContent(content, format);
    const rendered = format === 'markdown'
      ? this.sanitizeRichHtml(marked.parse(cleanContent, { gfm: true, breaks: false }) as string)
      : cleanContent;
    const $ = cheerio.load(rendered, null, false);
    const seen = new Map<string, number>();
    const toc: Array<{ id: string; text: string; level: number }> = [];
    $('h2, h3').each((_index, element) => {
      const heading = $(element);
      const text = heading.text().trim();
      if (!text) return;
      const base = this.headingSlug(text);
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      const id = count === 1 ? base : `${base}-${count}`;
      heading.attr('id', id);
      toc.push({ id, text, level: element.tagName.toLowerCase() === 'h2' ? 2 : 3 });
    });
    return {
      content: cleanContent,
      contentFormat: format,
      customCss: this.sanitizeCss(customCss),
      html: $.html(),
      toc,
    };
  }

  private headingSlug(value: string) {
    const slug = value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return slug || 'section';
  }
}
