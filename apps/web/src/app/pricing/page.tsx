import { redirect } from 'next/navigation'

export const metadata = {
  title: '方案定價 | Geovault',
  description: '查看 Geovault Free、Starter、Pro 方案與功能差異。',
}

export default function PricingPage() {
  redirect('/#pricing')
}
