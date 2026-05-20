'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  SupportConversation,
  useAdminSendSupportMessage,
  useAdminSupportConversations,
  useAdminSupportMessages,
  useAssignSupportConversation,
  useCloseSupportConversation,
  useSummarizeSupportConversation,
  useSupportRealtime,
} from '@/hooks/use-support';
import { SupportKnowledgePanel } from './support-knowledge-panel';

const statusLabel: Record<string, string> = {
  waiting_admin: '等待客服回覆',
  waiting_user: '等待用戶回覆',
  open: '處理中',
  closed: '已關閉',
};

const priorityLabel: Record<string, string> = {
  urgent: '緊急',
  high: '高',
  normal: '一般',
  low: '低',
};

const priorityClass: Record<string, string> = {
  urgent: 'border-red-500/40 bg-red-500/15 text-red-200',
  high: 'border-orange-500/40 bg-orange-500/15 text-orange-200',
  normal: 'border-blue-500/40 bg-blue-500/15 text-blue-200',
  low: 'border-gray-500/40 bg-gray-500/15 text-gray-200',
};

function AdminConversationList({
  items,
  selectedId,
  onSelect,
}: {
  items: SupportConversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-gray-400">目前沒有符合條件的客服對話。</p>;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`w-full rounded-lg border p-3 text-left transition ${
            selectedId === item.id
              ? 'border-red-500 bg-red-500/10'
              : 'border-white/10 bg-white/5 hover:bg-white/10'
          }`}
        >
          <div className="flex items-center gap-2">
            <p className="line-clamp-1 text-sm font-semibold text-white">{item.subject}</p>
            <Badge className={`ml-auto ${priorityClass[item.priority] || priorityClass.normal}`}>
              {priorityLabel[item.priority] || item.priority}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {item.userName || item.userEmail || '用戶'} · {item.planSnapshot} · {statusLabel[item.status] || item.status}
          </p>
          <p className="mt-2 line-clamp-2 text-xs text-gray-500">{item.latestMessage || '尚無訊息'}</p>
        </button>
      ))}
    </div>
  );
}

export default function AdminSupportPage() {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [reply, setReply] = useState('');
  const { data: conversations = [], isLoading } = useAdminSupportConversations({
    status: status || undefined,
    priority: priority || undefined,
  });

  const activeId = selectedId || conversations[0]?.id;
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId),
    [activeId, conversations],
  );
  const { data: messages = [] } = useAdminSupportMessages(activeId);
  useSupportRealtime(activeId, true);
  const replyMutation = useAdminSendSupportMessage(activeId);
  const assignMutation = useAssignSupportConversation(activeId);
  const closeMutation = useCloseSupportConversation(activeId);
  const summarizeMutation = useSummarizeSupportConversation(activeId);

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim() || !activeId) return;
    replyMutation.mutate(reply, {
      onSuccess: () => {
        setReply('');
        toast.success('已送出客服回覆');
      },
      onError: (error: any) => toast.error(error?.response?.data?.message || '送出失敗'),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">客服管理</h1>
        <p className="mt-1 text-sm text-gray-400">
          查看用戶對話、人工回覆、產生客服記憶摘要，並維護 AI 客服知識庫。
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base">篩選</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-10 rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white"
              >
                <option value="">全部狀態</option>
                <option value="waiting_admin">等待客服</option>
                <option value="waiting_user">等待用戶</option>
                <option value="closed">已關閉</option>
              </select>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="h-10 rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white"
              >
                <option value="">全部優先級</option>
                <option value="urgent">緊急</option>
                <option value="high">高</option>
                <option value="normal">一般</option>
                <option value="low">低</option>
              </select>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base">客服對話</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              ) : (
                <AdminConversationList items={conversations} selectedId={activeId} onSelect={setSelectedId} />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-[680px] border-white/10 bg-white/5">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-lg">{activeConversation?.subject || '選擇一個客服對話'}</CardTitle>
              {activeConversation && (
                <>
                  <Badge variant="outline" className="ml-auto">
                    {statusLabel[activeConversation.status] || activeConversation.status}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => assignMutation.mutate(undefined, { onSuccess: () => toast.success('已指派給你') })}
                    disabled={assignMutation.isPending || activeConversation.status === 'closed'}
                  >
                    指派給我
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => closeMutation.mutate(undefined, { onSuccess: () => toast.success('已關閉對話') })}
                    disabled={closeMutation.isPending || activeConversation.status === 'closed'}
                  >
                    關閉
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      summarizeMutation.mutate(undefined, { onSuccess: () => toast.success('已更新客服記憶') })
                    }
                    disabled={summarizeMutation.isPending}
                  >
                    更新記憶
                  </Button>
                </>
              )}
            </div>
            {activeConversation && (
              <p className="text-sm text-gray-400">
                {activeConversation.userName || activeConversation.userEmail} · {activeConversation.planSnapshot} ·{' '}
                {activeConversation.siteName || '未指定網站'}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex min-h-[560px] flex-col">
            {!activeConversation ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                請先選擇左側的客服對話。
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-white/10 bg-gray-950/60 p-4">
                  {messages.map((item) => {
                    const isAdmin = item.senderRole === 'admin';
                    return (
                      <div key={item.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[78%] rounded-lg px-4 py-3 text-sm ${
                            isAdmin ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-100'
                          }`}
                        >
                          <p className="mb-1 text-xs opacity-70">
                            {item.senderRole === 'ai' ? 'AI 助手' : isAdmin ? '客服' : item.senderName || '用戶'}
                          </p>
                          <p className="whitespace-pre-wrap leading-6">{item.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={submitReply} className="mt-4 flex gap-3">
                  <Textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={2}
                    placeholder={activeConversation.status === 'closed' ? '此對話已關閉' : '輸入客服回覆'}
                    disabled={activeConversation.status === 'closed'}
                  />
                  <Button
                    type="submit"
                    disabled={replyMutation.isPending || !reply.trim() || activeConversation.status === 'closed'}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <SupportKnowledgePanel />
    </div>
  );
}
