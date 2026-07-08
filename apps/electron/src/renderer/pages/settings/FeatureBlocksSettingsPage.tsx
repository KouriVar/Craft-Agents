import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

import { PanelHeader } from "@/components/app-shell/PanelHeader";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsSection, SettingsInput, SettingsToggle } from "@/components/settings";
import { routes } from "@/lib/navigate";
import { cn } from "@/lib/utils";
import type { FeatureBlock } from "../../../shared/feature-blocks";

const DEFAULT_NEW_BLOCK: FeatureBlock = {
  id: "new",
  title: "",
  url: "",
  pinned: true,
};

function createBlock(): FeatureBlock {
  return {
    ...DEFAULT_NEW_BLOCK,
    id: crypto.randomUUID(),
  };
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function FeatureBlocksSettingsPage() {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<readonly FeatureBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBlocks() {
      try {
        const config = await window.electronAPI.getFeatureBlocksConfig();
        if (!cancelled) setBlocks(config.blocks);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "读取功能块失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadBlocks();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<FeatureBlock>) => {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
    setError(null);
  }, []);

  const addBlock = useCallback(() => {
    setBlocks((current) => [...current, createBlock()]);
    setError(null);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((current) => current.filter((block) => block.id !== id));
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    const normalizedBlocks = blocks.map((block) => ({
      ...block,
      title: block.title.trim(),
      url: normalizeUrl(block.url),
    })).filter((block) => block.title && block.url);

    try {
      const saved = await window.electronAPI.setFeatureBlocksConfig({ blocks: normalizedBlocks });
      setBlocks(saved.blocks);
      window.dispatchEvent(new CustomEvent("feature-blocks-changed"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存功能块失败，请检查网址格式");
    } finally {
      setIsSaving(false);
    }
  }, [blocks]);

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={t("settings.featureBlocks.title", "功能块")}
        actions={<HeaderMenu route={routes.view.settings("featureBlocks")} />}
      />

      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto space-y-6">
            <SettingsSection
              title="固定网页入口"
              description="把 Figma、Google 或任何常用网页固定到左侧栏。网页会用 Craft Agent 内置浏览器打开，退出应用后保留登录状态。"
              action={
                <Button size="sm" variant="outline" onClick={addBlock}>
                  <Plus className="h-3.5 w-3.5" />
                  添加网址
                </Button>
              }
            >
              <SettingsCard divided={false}>
                <div className={cn("p-4 space-y-4", isLoading && "opacity-60")}>
                  {blocks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                      还没有功能块，先添加一个网址。
                    </div>
                  )}

                  {blocks.map((block) => (
                    <div key={block.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(120px,0.45fr)_minmax(180px,1fr)_auto] md:items-end">
                        <SettingsInput
                          label="名称"
                          value={block.title}
                          onChange={(title) => updateBlock(block.id, { title })}
                          placeholder="Figma"
                        />
                        <SettingsInput
                          label="网址"
                          type="url"
                          value={block.url}
                          onChange={(url) => updateBlock(block.id, { url })}
                          placeholder="https://www.figma.com"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => removeBlock(block.id)}
                          aria-label="删除功能块"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <SettingsToggle
                          label="固定到侧边栏"
                          description="关闭后会保存在设置里，但不会出现在左侧功能块列表。"
                          checked={block.pinned}
                          onCheckedChange={(pinned) => updateBlock(block.id, { pinned })}
                          inCard={false}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const normalized = normalizeUrl(block.url);
                            if (normalized) void window.electronAPI.openUrl(normalized);
                          }}
                          disabled={!block.url.trim()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          预览
                        </Button>
                      </div>
                    </div>
                  ))}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button onClick={save} disabled={isLoading || isSaving}>
                      {isSaving ? "保存中..." : "保存功能块"}
                    </Button>
                  </div>
                </div>
              </SettingsCard>
            </SettingsSection>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
