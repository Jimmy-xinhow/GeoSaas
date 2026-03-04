import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SnippetGeneratorService {
  constructor(private readonly config: ConfigService) {}

  generate(siteId: string, token: string): string {
    const apiUrl = this.config.get<string>('API_URL') || 'http://localhost:4000';

    return `<!-- GEO-SaaS AI Crawler Tracker -->
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
</script>`;
  }
}
