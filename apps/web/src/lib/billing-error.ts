import { toast } from 'sonner';

export function isBillingRequiredError(error: any): boolean {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const code = data?.code;
  const message = typeof data?.message === 'string' ? data.message : '';
  return (
    status === 402 ||
    code === 'INSUFFICIENT_CREDITS' ||
    message.includes('點數不足') ||
    message.includes('購買點數') ||
    message.includes('升級方案')
  );
}

export function showBillingRequiredToast(error: any) {
  const message =
    typeof error?.response?.data?.message === 'string'
      ? error.response.data.message
      : 'AI 生成點數不足，請先購買點數或升級方案。';

  toast.error('需要點數才能繼續', {
    id: 'billing-required',
    description: message,
    action: {
      label: '前往方案 / 點數',
      onClick: () => {
        window.location.href = '/settings#credits';
      },
    },
  });
}
