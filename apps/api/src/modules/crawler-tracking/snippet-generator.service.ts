import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SnippetGeneratorService {
  constructor(private readonly config: ConfigService) {}

  generate(siteId: string, token: string, siteUrl: string): string {
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') || 'https://api.geovault.app';
    const fallbackUrl = encodeURIComponent(siteUrl);

    // Use image requests instead of cross-origin XHR so customer origins do
    // not need broad credentialed CORS. JS-capable clients include the exact
    // page URL; no-JS parsers get a site-bound fallback URL. The API still
    // treats the resulting User-Agent match as ua_only evidence.
    return `<!-- Geovault AI Crawler Tracker -->
<script>
(function() {
  var beacon = new Image();
  beacon.referrerPolicy = 'strict-origin-when-cross-origin';
  beacon.src = '${apiUrl}/api/crawler/pixel/${token}.gif?u=' + encodeURIComponent(window.location.href);
})();
</script>
<noscript><img src="${apiUrl}/api/crawler/pixel/${token}.gif?u=${fallbackUrl}" alt="" width="1" height="1" style="position:absolute;left:-9999px;top:-9999px" referrerpolicy="strict-origin-when-cross-origin" /></noscript>`;
  }
}
