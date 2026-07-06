/**
 * 集中管理通知類型常數。
 * 所有 notificationsService.create() 呼叫點與 email 分派 switch 都必須使用這裡的小寫值，
 * 避免大小寫不一致導致 email 永不寄出（歷史 bug：'MONITOR_CHANGE' vs 'monitor_change'）。
 */
export const NotificationType = {
  SCAN_COMPLETE: 'scan_complete',
  BADGE_EARNED: 'badge_earned',
  MONITOR_CHANGE: 'monitor_change',
  SCORE_DROP: 'score_drop',
  WELCOME: 'welcome',
} as const;

export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];
