export interface IPlatformAdapter {
  platform: string;
  publish(content: { title: string; body: string; tags?: string[] }, config: Record<string, string>): Promise<{ externalUrl: string; externalId: string }>;
}
