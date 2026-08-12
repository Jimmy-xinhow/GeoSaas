'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trackEvent } from '@/lib/analytics';
import Link from 'next/link';

export default function BillingResultPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const orderNo = searchParams.get('orderNo');
  const message = searchParams.get('message');

  useEffect(() => {
    if (!success || !orderNo) return;
    const key = `geovault_purchase_${orderNo}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      if (trackEvent('purchase', {
        transaction_id: orderNo,
        currency: 'TWD',
      })) {
        window.sessionStorage.setItem(key, '1');
      }
    } catch {
      // Payment confirmation must remain usable when analytics storage fails.
    }
  }, [orderNo, success]);

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {success ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-600" />
                付款成功
              </>
            ) : (
              <>
                <XCircle className="h-6 w-6 text-red-600" />
                付款失敗
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {message || (success ? '您的方案已升級' : '請重新嘗試')}
          </p>
          {orderNo && (
            <p className="text-sm text-muted-foreground">訂單編號：{orderNo}</p>
          )}
          <Link href="/settings">
            <Button className="w-full">返回設定頁</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
