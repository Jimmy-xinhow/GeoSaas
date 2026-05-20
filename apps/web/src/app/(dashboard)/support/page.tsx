'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSites } from '@/hooks/use-sites';
import {
  SupportConversation,
  useCreateSupportConversation,
  useSendSupportMessage,
  useSupportConversations,
  useSupportMessages,
  useSupportRealtime,
} from '@/hooks/use-support';
import useAuthStore from '@/stores/auth-store';

const statusLabel: Record<string, string> = {
  waiting_admin: '等待客服',
  waiting_user: '等待你回覆',
  open: '進行中',
  closed: '已結案',
};

const channelLabel: Record<string, string> = {
  ticket: '工單',
  message: '站內訊息',
  realtime: '即時優先',
};

function ConversationList({
  items,
  selectedId,
  onSelect,
}: {
  items: SupportConversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400">目前沒有客服對話。</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`w-full rounded-lg border p-3 text-left transition ${
            selectedId === item.id
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-white/10 bg-white/5 hover:bg-white/10'
          }`}
        >
          <div className="flex items-center gap-2">
            <p className="line-clamp-1 text-sm font-semibold text-white">{item.subject}</p>
            <Badge variant="outline" className="ml-auto">
              {statusLabel[item.status] || item.status}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-gray-400">{item.latestMessage || '尚無訊息'}</p>
          <p className="mt-2 text-xs text-gray-500">{channelLabel[item.channel] || item.channel}</p>
        </button>
      ))}
    </div>
  );
}

export default function SupportPage() {
  const user = useAuthStore((s) => s.user);
  const { data: conversations = [], isLoading } = useSupportConversations();
  const { data: sites = [] } = useSites();
  const [selectedId, setSelectedId] = useState<string>();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('scan');
  const [siteId, setSiteId] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const createMutation = useCreateSupportConversation();

  const activeId = selectedId || conversations[0]?.id;
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId),
    [activeId, conversations],
  );
  const { data: messages = [] } = useSupportMessages(activeId);
  const sendMutation = useSendSupportMessage(activeId);
  useSupportRealtime(activeId);

  const submitNew = (event: FormEvent) => {
    event.preventDefault();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject) {
      toast.error('請先填寫問題標題');
      return;
    }
    if (!trimmedMessage) {
      toast.error('請先填寫問題內容');
      return;
    }
    createMutation.mutate(
      {
        subject: trimmedSubject,
        message: trimmedMessage,
        category,
        siteId: siteId || undefined,
      },
      {
        onSuccess: (created) => {
          setSelectedId(created.id);
          setSubject('');
          setMessage('');
          toast.success('已建立客服對話');
        },
      },
    );
  };

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim() || !activeId) return;
    sendMutation.mutate(reply, {
      onSuccess: () => {
        setReply('');
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">客服中心</h1>
        <p className="mt-1 text-sm text-gray-400">
          你的方案：{user?.plan || 'FREE'}。PRO 會標記為即時優先，STARTER 使用站內訊息，FREE 以工單處理。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquarePlus className="h-4 w-4" />
                建立新對話
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitNew} className="space-y-3">
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="問題標題"
                />
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white"
                >
                  <option value="scan">掃描 / 分數</option>
                  <option value="llms">llms.txt / AI 爬蟲</option>
                  <option value="content">文章 / 內容品質</option>
                  <option value="billing">帳務 / 方案</option>
                  <option value="general">其他</option>
                </select>
                <select
                  value={siteId}
                  onChange={(event) => setSiteId(event.target.value)}
                  className="h-10 w-full rounded-md border border-white/10 bg-gray-950 px-3 text-sm text-white"
                >
                  <option value="">不指定網站</option>
                  {sites.map((site: any) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="請描述你遇到的狀況、網址、錯誤畫面或想確認的內容。"
                  rows={5}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '送出'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base">我的對話</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              ) : (
                <ConversationList items={conversations} selectedId={activeId} onSelect={setSelectedId} />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-[640px] border-white/10 bg-white/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">{activeConversation?.subject || '選擇一個客服對話'}</CardTitle>
              {activeConversation && (
                <Badge variant="outline" className="ml-auto">
                  {statusLabel[activeConversation.status] || activeConversation.status}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[540px] flex-col">
            {!activeConversation ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                建立或選擇一個客服對話。
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-white/10 bg-gray-950/60 p-4">
                  {messages.map((item) => {
                    const isMine = item.senderRole === 'user';
                    return (
                      <div key={item.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[78%] rounded-lg px-4 py-3 text-sm ${
                            isMine ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-100'
                          }`}
                        >
                          <p className="mb-1 text-xs opacity-70">
                            {item.senderRole === 'ai' ? 'AI 助手' : isMine ? '你' : item.senderName || '客服'}
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
                    placeholder={activeConversation.status === 'closed' ? '此對話已結案' : '輸入回覆'}
                    rows={2}
                    disabled={activeConversation.status === 'closed'}
                  />
                  <Button
                    type="submit"
                    disabled={sendMutation.isPending || !reply.trim() || activeConversation.status === 'closed'}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
