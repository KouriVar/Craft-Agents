import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PanelHeader } from "@/components/app-shell/PanelHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HeaderMenu } from "@/components/ui/HeaderMenu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
} from "@/components/settings";
import { routes } from "@/lib/navigate";
import { Eye, EyeOff } from "lucide-react";
import type { MemoryGatewayStatus, MemorySettings } from "../../../shared/memory-settings";

const DEFAULT_SETTINGS: MemorySettings = {
  enabled: false,
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  deepseekBaseUrl: "https://api.deepseek.com/v1",
  embeddingApiKey: "",
  embeddingProvider: "",
  embeddingModel: "",
  embeddingBaseUrl: "",
};

function ApiKeyField({
  label,
  description,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">{label}</span>
        {required && <span className="text-red-500 text-sm">*</span>}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10 font-mono text-sm"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setShow(!show)}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function MemorySettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<MemorySettings>(DEFAULT_SETTINGS);
  const [gatewayStatus, setGatewayStatus] = useState<MemoryGatewayStatus>("stopped");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [savedEnabled, setSavedEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const [config, status] = await Promise.all([
          window.electronAPI.getMemoryConfig(),
          window.electronAPI.getMemoryStatus(),
        ]);
        if (cancelled) return;
        setSettings(config);
        setGatewayStatus(status);
        setSavedEnabled(config.enabled);
        setHasPendingChanges(false);
      } catch (error) {
        if (cancelled) return;
        setSaveError(error instanceof Error ? error.message : "读取记忆设置失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await window.electronAPI.getMemoryStatus();
    setGatewayStatus(status);
  }, []);

  useEffect(() => {
    if (!savedEnabled) {
      setGatewayStatus("stopped");
      return;
    }

    void refreshStatus();
    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [refreshStatus, savedEnabled]);

  const update = useCallback((patch: Partial<MemorySettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setHasPendingChanges(true);
    setSaveError(null);
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await window.electronAPI.setMemoryConfig(settings);
      await refreshStatus();
      setSavedEnabled(settings.enabled);
      setHasPendingChanges(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存记忆设置失败");
    } finally {
      setIsSaving(false);
    }
  }, [refreshStatus, settings]);

  const statusText = hasPendingChanges
    ? "待保存"
    : !savedEnabled
      ? "已关闭"
      : gatewayStatus === "ok"
        ? "正常运行"
        : gatewayStatus === "degraded"
          ? "降级运行"
          : gatewayStatus === "unreachable"
            ? "无法连接"
            : "已停止";

  return (
    <div className="h-full flex flex-col">
      <PanelHeader
        title={t("settings.memory.title", "记忆 (Memory)")}
        actions={<HeaderMenu route={routes.view.settings("memory")} />}
      />

      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto space-y-6">

            <SettingsSection title="记忆功能">
              <SettingsCard>
                <SettingsToggle
                  label="启用记忆功能"
                  description="开启后，AI 会从对话中自动提取关键信息，下次对话时可以回忆起来。数据仅存储在本地。"
                  checked={settings.enabled}
                  onCheckedChange={(checked) => update({ enabled: checked })}
                />
                <SettingsRow
                  label="Gateway 状态"
                >
                  <span className="text-sm text-muted-foreground">
                    {isLoading ? "读取中" : statusText}
                  </span>
                </SettingsRow>
              </SettingsCard>
            </SettingsSection>

            <SettingsSection title="DeepSeek">
              <SettingsCard>
                <div className="p-4 space-y-4">
                  <ApiKeyField
                    label="DeepSeek API Key"
                    description="用于记忆抽取（L1/L2/L3）。在 platform.deepseek.com 获取。"
                    value={settings.deepseekApiKey}
                    onChange={(v) => update({ deepseekApiKey: v })}
                    placeholder="sk-..."
                    required
                  />
                  {settings.deepseekApiKey && (
                    <>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">模型名称</span>
                        <Input
                          value={settings.deepseekModel}
                          onChange={(e) => update({ deepseekModel: e.target.value })}
                          placeholder="deepseek-chat"
                          spellCheck={false}
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">API 地址</span>
                        <Input
                          value={settings.deepseekBaseUrl}
                          onChange={(e) => update({ deepseekBaseUrl: e.target.value })}
                          placeholder="https://api.deepseek.com/v1"
                          spellCheck={false}
                        />
                      </div>
                    </>
                  )}
                </div>
              </SettingsCard>
            </SettingsSection>

            <SettingsSection title="Embedding">
              <SettingsCard>
                <div className="p-4 space-y-4">
                  <ApiKeyField
                    label="Embedding API Key（可选）"
                    description="配置后开启 hybrid 召回模式。推荐硅基流动，注册即送免费额度。"
                    value={settings.embeddingApiKey}
                    onChange={(v) => update({ embeddingApiKey: v })}
                    placeholder="留空则使用纯关键词模式"
                  />
                  {settings.embeddingApiKey && (
                    <>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Provider</span>
                        <Input
                          value={settings.embeddingProvider}
                          onChange={(e) => update({ embeddingProvider: e.target.value })}
                          placeholder="例如：siliconflow"
                          spellCheck={false}
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">模型名称</span>
                        <Input
                          value={settings.embeddingModel}
                          onChange={(e) => update({ embeddingModel: e.target.value })}
                          placeholder="例如：BAAI/bge-m3"
                          spellCheck={false}
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">API 地址</span>
                        <Input
                          value={settings.embeddingBaseUrl}
                          onChange={(e) => update({ embeddingBaseUrl: e.target.value })}
                          placeholder="例如：https://api.siliconflow.cn/v1"
                          spellCheck={false}
                        />
                      </div>
                    </>
                  )}
                </div>
              </SettingsCard>
            </SettingsSection>

            <div className="flex items-center justify-end gap-3">
              {saveError && (
                <span className="text-sm text-destructive">{saveError}</span>
              )}
              {hasPendingChanges && !saveError && (
                <span className="text-sm text-muted-foreground">有未保存更改</span>
              )}
              <Button onClick={save} disabled={isLoading || isSaving || !hasPendingChanges}>
                {isSaving ? "保存中..." : "保存并应用"}
              </Button>
            </div>

          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
