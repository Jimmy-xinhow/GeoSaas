import { redirect } from 'next/navigation';

export default function LegacyDashboardSitePage({
  params,
}: {
  params: { siteId: string };
}) {
  redirect(`/sites/${params.siteId}`);
}
