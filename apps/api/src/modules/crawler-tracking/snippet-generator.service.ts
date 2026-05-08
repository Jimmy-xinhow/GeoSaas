import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SnippetGeneratorService {
  constructor(private readonly config: ConfigService) {}

  generate(siteId: string, token: string): string {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') || 'https://api.geovault.app';

    // Two-layer tracking:
    //   1. <script> XHR — fires when a JS-rendering bot (Googlebot 2nd pass)
    //      hits the page. Captures bot identity from navigator.userAgent.
    //   2. <img> pixel — fires for HTML-only crawlers (current GPTBot,
    //      ClaudeBot, PerplexityBot don't execute JS at all). The image
    //      request hits the server with the bot's User-Agent header, so
    //      detection happens server-side via matchAiBot(). Without this
    //      layer, customer sites on plain static hosts (GitHub Pages,
    //      Cloudflare Pages without Workers, S3 + CloudFront) miss every
    //      non-JS AI bot and report 0 visits even when bots are scraping.
    return `<!-- Geovault AI Crawler Tracker -->
<script>
(function() {
  var AI_BOTS = [
    { name: 'ClaudeBot', pattern: 'ClaudeBot' },
    { name: 'GPTBot', pattern: 'GPTBot' },
    { name: 'ChatGPT-User', pattern: 'ChatGPT-User' },
    { name: 'Google-Extended', pattern: 'Google-Extended' },
    { name: 'PerplexityBot', pattern: 'PerplexityBot' },
    { name: 'YouBot', pattern: 'YouBot' },
    { name: 'CCBot', pattern: 'CCBot' },
    { name: 'Bytespider', pattern: 'Bytespider' },
    { name: 'Bingbot', pattern: 'bingbot' },
    { name: 'Googlebot', pattern: 'Googlebot' }
  ];
  var ua = navigator.userAgent;
  for (var i = 0; i < AI_BOTS.length; i++) {
    if (ua.indexOf(AI_BOTS[i].pattern) !== -1) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '${apiUrl}/api/crawler/report', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        token: '${token}',
        botName: AI_BOTS[i].name,
        url: window.location.href,
        userAgent: ua
      }));
      break;
    }
  }
})();
</script>
<img src="${apiUrl}/api/crawler/pixel/${token}.gif" alt="" width="1" height="1" style="position:absolute;left:-9999px;top:-9999px" referrerpolicy="no-referrer-when-downgrade" />`;
  }
}
