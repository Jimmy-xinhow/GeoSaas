'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Download, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const pluginDownloadUrl = '/downloads/geovault-auto-fix-0.1.2.zip'

const visualGuideSteps = [
  {
    title: '1. 從 Geovault 下載外掛',
    description: '在 CMS 一鍵結構修復頁，按「下載 WordPress 外掛」取得 ZIP 檔。',
    image: '/cms-fix-guide/01-geovault-download.jpg',
  },
  {
    title: '2. 進入 WordPress 外掛頁',
    description: '到 WordPress 後台左側選單點「外掛」，再按上方「安裝外掛」。',
    image: '/cms-fix-guide/02-wp-installed-plugins.jpg',
  },
  {
    title: '3. 切換到上傳外掛',
    description: '在安裝外掛頁面按「上傳外掛」，準備上傳剛剛下載的 ZIP。',
    image: '/cms-fix-guide/03-wp-upload-plugin.jpg',
  },
  {
    title: '4. 選擇 geovault-auto-fix.zip',
    description: '按「選擇檔案」，選取下載資料夾裡的 geovault-auto-fix.zip。',
    image: '/cms-fix-guide/04-wp-choose-zip.jpg',
  },
  {
    title: '5. 立即安裝',
    description: '檔名出現後，按「立即安裝」讓 WordPress 安裝外掛。',
    image: '/cms-fix-guide/05-wp-install-now.jpg',
  },
  {
    title: '6. 啟用外掛',
    description: '安裝完成後按「啟用外掛」，讓 Geovault Auto Fix 開始出現在後台。',
    image: '/cms-fix-guide/06-wp-activate-plugin.jpg',
  },
  {
    title: '7. 確認外掛已啟用',
    description: '回到已安裝外掛列表，確認 Geovault Auto Fix 顯示為已啟用狀態。',
    image: '/cms-fix-guide/07-wp-plugin-enabled.jpg',
  },
  {
    title: '8. 打開 Geovault Auto Fix 設定',
    description: '到 WordPress 左側「設定」底下，點 Geovault Auto Fix。',
    image: '/cms-fix-guide/08-wp-settings-menu.jpg',
  },
  {
    title: '9. 在 Geovault 產生並複製設定',
    description: '回到 Geovault 產生 Token，複製 API URL、Site ID、Plugin Token。',
    image: '/cms-fix-guide/09-geovault-token.jpg',
  },
  {
    title: '10. 貼到 WordPress 並儲存',
    description: '把三個欄位貼到 WordPress 設定頁，按儲存設定，再按立即同步修復。',
    image: '/cms-fix-guide/10-wp-save-sync.jpg',
  },
]

export default function CmsFixGuidePage() {
  const params = useParams()
  const siteId = params.siteId as string

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/sites/${siteId}/cms-fix`}
          className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-white"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回 CMS 一鍵結構修復
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <PlugZap className="h-7 w-7 text-blue-400" />
              <h1 className="text-2xl font-bold text-white">WordPress 外掛安裝圖解</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              依照實際 WordPress 後台畫面操作。這裡只負責教學安裝與貼上綁定設定，最後的外部主機連線需要使用公開 API 或 tunnel 才能完成。
            </p>
          </div>
          <a href={pluginDownloadUrl} download>
            <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              下載 WordPress 外掛
            </Button>
          </a>
        </div>
      </div>

      <Card className="border-yellow-500/30 bg-yellow-500/10">
        <CardContent className="py-4 text-sm text-yellow-100">
          如果 WordPress 主機在外部網路，而 API URL 是 <code>192.168.x.x</code> 或 <code>localhost</code>，外掛同步會連不到本機 API。正式測試時要改用公開 API 網址或 tunnel。
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>照圖操作</CardTitle>
          <CardDescription>每一步都對應你在 WordPress 後台會看到的實際畫面。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visualGuideSteps.map((step) => (
            <div key={step.title} className="overflow-hidden rounded-md border border-white/10 bg-slate-950/40">
              <div className="border-b border-white/10 p-4">
                <p className="font-medium text-white">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
              <img
                src={step.image}
                alt={step.title}
                className="w-full bg-white object-contain"
                loading="lazy"
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
