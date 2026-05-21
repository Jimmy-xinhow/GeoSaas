import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export interface GuidedIssue {
  indicator: string;
  label: string;
  score: number;
  status: string;
  canAutoFix: boolean;
  estimatedGain: number;
  whyItMatters: string;
  nextStep: string;
  suggestion?: string | null;
}

export interface GuidedPath {
  key: 'wordpress' | 'engineer' | 'done_for_you';
  title: string;
  description: string;
  effort: string;
  cta: string;
  href: string;
  recommended: boolean;
}

export interface GuidedPlan {
  site: {
    id: string;
    name: string;
    url: string;
    industry?: string | null;
    bestScore: number;
    tier?: string | null;
  };
  scan: {
    id: string;
    score: number;
    completedAt: string;
  };
  headline: {
    title: string;
    currentScore: number;
    estimatedScore: number;
    estimatedMinutes: number;
    quickWinCount: number;
    manualCount: number;
  };
  recommendedPath: string;
  paths: GuidedPath[];
  quickWins: GuidedIssue[];
  manualItems: GuidedIssue[];
  missingBrandFacts: string[];
  paymentTrigger: {
    title: string;
    bullets: string[];
  };
}

export interface HandoffFile {
  path: string;
  purpose: string;
  language: string;
  content: string;
}

export interface EngineerHandoff {
  site: GuidedPlan['site'];
  generatedAt: string;
  summary: {
    currentScore: number;
    estimatedScore: number;
    installTime: string;
    files: number;
  };
  instructions: string[];
  files: HandoffFile[];
}

export interface CompletionReport {
  site: GuidedPlan['site'];
  latestScan: {
    id: string;
    score: number;
    completedAt: string;
  };
  previousScan?: {
    id: string;
    score: number;
    completedAt: string;
  } | null;
  scoreDelta: number;
  resolved: GuidedIssue[];
  remaining: GuidedIssue[];
  verification: Array<{ key: string; label: string; passed: boolean }>;
  crawlerVisits: Array<{ botName: string; url: string; visitedAt: string }>;
  nextSteps: string[];
}

export function useGuidedFixPlan(siteId: string) {
  return useQuery({
    queryKey: ['guided-fix', siteId, 'plan'],
    queryFn: async () => {
      const { data } = await apiClient.get<GuidedPlan>(`/guided-fix/sites/${siteId}/plan`);
      return data;
    },
    enabled: Boolean(siteId),
  });
}

export function useEngineerHandoff(siteId: string) {
  return useQuery({
    queryKey: ['guided-fix', siteId, 'handoff'],
    queryFn: async () => {
      const { data } = await apiClient.get<EngineerHandoff>(`/guided-fix/sites/${siteId}/handoff-package`);
      return data;
    },
    enabled: Boolean(siteId),
  });
}

export function useCompletionReport(siteId: string) {
  return useQuery({
    queryKey: ['guided-fix', siteId, 'completion-report'],
    queryFn: async () => {
      const { data } = await apiClient.get<CompletionReport>(`/guided-fix/sites/${siteId}/completion-report`);
      return data;
    },
    enabled: Boolean(siteId),
  });
}
