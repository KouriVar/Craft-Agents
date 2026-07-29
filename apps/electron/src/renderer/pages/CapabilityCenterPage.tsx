import * as React from 'react'
import { useAtomValue } from 'jotai'
import { Bot, Cable, Copy, Pencil, Store, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { PluginMarketplaceBrowser } from '@/components/plugins/PluginMarketplaceBrowser'
import { Info_Page, Info_Section, Info_Table } from '@/components/info'
import type { CapabilityAssignment, ExpertInput, ExpertProfile } from '@craft-agent/shared/experts'
import type { Connector } from '@craft-agent/shared/connectors'
import type { WorkspacePluginEntry } from '@craft-agent/shared/plugins'
import type { LoadedProject } from '@craft-agent/shared/projects'
import type { LoadedSkill } from '../../shared/types'
import { capabilityNavigatorKindAtom, selectedCapabilityIdAtom } from '@/atoms/capability-center'
import SkillInfoPage from '@/pages/SkillInfoPage'

type ExpertForm = { name: string; description: string; systemPrompt: string; model: string; connectionSlug: string; collaborationRule: string; memoryRule: NonNullable<ExpertInput['memoryRule']>; skillSlugs: string; connectorIds: string }

const emptyExpertForm = (): ExpertForm => ({ name: '', description: '', systemPrompt: '', model: '', connectionSlug: '', collaborationRule: '', memoryRule: 'inherit', skillSlugs: '', connectorIds: '' })
const expertToForm = (expert: ExpertProfile): ExpertForm => ({
  name: expert.name,
  description: expert.description || '',
  systemPrompt: expert.systemPrompt || '',
  model: expert.model || '',
  connectionSlug: expert.connectionSlug || '',
  collaborationRule: expert.collaborationRule || '',
  memoryRule: expert.memoryRule || 'inherit',
  skillSlugs: expert.skillSlugs.join(', '),
  connectorIds: expert.connectorIds.join(', '),
})
const splitList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean)

export function CapabilityCenterPage({
  workspaceId,
  skills,
  installedPlugins,
  onPluginInstalled,
}: {
  workspaceId: string
  skills: LoadedSkill[]
  installedPlugins: WorkspacePluginEntry[]
  onPluginInstalled: (plugin: WorkspacePluginEntry) => void
}) {
  const tab = useAtomValue(capabilityNavigatorKindAtom)
  const selectedId = useAtomValue(selectedCapabilityIdAtom)
  const [experts, setExperts] = React.useState<ExpertProfile[]>([])
  const [connectors, setConnectors] = React.useState<Connector[]>([])
  const [projects, setProjects] = React.useState<LoadedProject[]>([])
  const [editingExpert, setEditingExpert] = React.useState<ExpertProfile | null>(null)
  const [expertDialogOpen, setExpertDialogOpen] = React.useState(false)
  const [expertForm, setExpertForm] = React.useState<ExpertForm>(emptyExpertForm)
  const [marketplaceOpen, setMarketplaceOpen] = React.useState(false)
  const [assignmentOpen, setAssignmentOpen] = React.useState(false)
  const [assignmentTarget, setAssignmentTarget] = React.useState('global')
  const [assignment, setAssignment] = React.useState<CapabilityAssignment>({ scope: 'global', skillSlugs: [], connectorIds: [] })

  const refresh = React.useCallback(async () => {
    try {
      const [nextExperts, nextConnectors, nextProjects] = await Promise.all([
        window.electronAPI.listExperts(workspaceId),
        window.electronAPI.listConnectors(workspaceId),
        window.electronAPI.getProjects(workspaceId) as Promise<LoadedProject[]>,
      ])
      setExperts(nextExperts)
      setConnectors(nextConnectors)
      setProjects(nextProjects)
    } catch (error) {
      toast.error('能力中心加载失败', { description: error instanceof Error ? error.message : String(error) })
    }
  }, [workspaceId])

  React.useEffect(() => { void refresh() }, [refresh])

  const saveExpert = async () => {
    const input: ExpertInput = {
      name: expertForm.name.trim() || '未命名专家',
      description: expertForm.description.trim() || undefined,
      systemPrompt: expertForm.systemPrompt.trim() || undefined,
      model: expertForm.model.trim() || undefined,
      connectionSlug: expertForm.connectionSlug.trim() || undefined,
      collaborationRule: expertForm.collaborationRule.trim() || undefined,
      memoryRule: expertForm.memoryRule,
      skillSlugs: splitList(expertForm.skillSlugs),
      connectorIds: splitList(expertForm.connectorIds),
    }
    try {
      if (editingExpert) await window.electronAPI.updateExpert(workspaceId, editingExpert.id, input)
      else await window.electronAPI.createExpert(workspaceId, input)
      setEditingExpert(null)
      setExpertDialogOpen(false)
      await refresh()
    } catch (error) {
      toast.error('保存专家失败', { description: error instanceof Error ? error.message : String(error) })
    }
  }

  React.useEffect(() => {
    const handleOpenMarketplace = () => setMarketplaceOpen(true)
    window.addEventListener('craft:capability-open-marketplace', handleOpenMarketplace)
    return () => {
      window.removeEventListener('craft:capability-open-marketplace', handleOpenMarketplace)
    }
  }, [])
  const openEditExpert = (expert: ExpertProfile) => { setEditingExpert(expert); setExpertForm(expertToForm(expert)); setExpertDialogOpen(true) }
  const loadAssignment = async (target = assignmentTarget) => {
    const [scope, scopeId] = target === 'global' ? ['global' as const, undefined] : target.split(':') as [CapabilityAssignment['scope'], string]
    setAssignmentTarget(target)
    setAssignment(await window.electronAPI.getCapabilityAssignment(workspaceId, scope, scopeId))
    setAssignmentOpen(true)
  }
  const toggleAssignment = (kind: 'skillSlugs' | 'connectorIds', value: string) => setAssignment(current => ({ ...current, [kind]: current[kind].includes(value) ? current[kind].filter(item => item !== value) : [...current[kind], value] }))
  const saveAssignment = async () => { await window.electronAPI.setCapabilityAssignment(workspaceId, assignment); setAssignmentOpen(false); toast.success('能力分配已保存') }

  const selectedExpert = experts.find(expert => expert.id === selectedId)
  const selectedSkill = skills.find(skill => skill.slug === selectedId)
  const selectedConnector = connectors.find(connector => connector.id === selectedId)

  if (tab === 'skills' && selectedSkill) {
    return <SkillInfoPage workspaceId={workspaceId} skillSlug={selectedSkill.slug} />
  }

  if (tab === 'experts' && selectedExpert) {
    const memoryRuleLabel = selectedExpert.memoryRule === 'project-only' ? '仅项目记忆'
      : selectedExpert.memoryRule === 'none' ? '不使用记忆'
        : '继承项目与会话记忆'
    return <Info_Page>
      <Info_Page.Header
        title={selectedExpert.name}
        titleAlign="left"
        actions={<div className="flex items-center gap-1">
          <HeaderIconButton icon={<Pencil className="h-4 w-4" />} tooltip="编辑专家" onClick={() => openEditExpert(selectedExpert)} />
          <HeaderIconButton icon={<Copy className="h-4 w-4" />} tooltip="复制专家" onClick={() => void window.electronAPI.duplicateExpert(workspaceId, selectedExpert.id).then(refresh)} />
          <HeaderIconButton icon={<Trash2 className="h-4 w-4" />} tooltip="删除专家" onClick={() => void window.electronAPI.deleteExpert(workspaceId, selectedExpert.id).then(refresh)} />
        </div>}
      />
      <Info_Page.Hero avatar={<Bot className="h-8 w-8" />} title={selectedExpert.name} tagline={selectedExpert.description || '通用协作专家'} />
      <Info_Page.Content>
        {selectedExpert.systemPrompt && <Info_Section title="系统指令">
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-6">{selectedExpert.systemPrompt}</pre>
        </Info_Section>}
        <Info_Section title="配置">
          <Info_Table>
            <Info_Table.Row label="模型" value={selectedExpert.model || '使用默认模型'} />
            <Info_Table.Row label="连接" value={selectedExpert.connectionSlug || '使用默认连接'} />
            <Info_Table.Row label="记忆规则" value={memoryRuleLabel} />
            <Info_Table.Row label="协作规则" value={selectedExpert.collaborationRule || '无'} />
          </Info_Table>
        </Info_Section>
        <Info_Section title={`技能 (${selectedExpert.skillSlugs.length})`}>
          {selectedExpert.skillSlugs.length > 0
            ? <div className="flex flex-wrap gap-1.5">{selectedExpert.skillSlugs.map(slug => <span key={slug} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{slug}</span>)}</div>
            : <p className="text-sm text-muted-foreground">未分配技能</p>}
        </Info_Section>
        <Info_Section title={`连接器 (${selectedExpert.connectorIds.length})`}>
          {selectedExpert.connectorIds.length > 0
            ? <div className="flex flex-wrap gap-1.5">{selectedExpert.connectorIds.map(id => {
                const connector = connectors.find(c => c.id === id)
                return <span key={id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{connector?.name ?? id}</span>
              })}</div>
            : <p className="text-sm text-muted-foreground">未分配连接器</p>}
        </Info_Section>
      </Info_Page.Content>
    </Info_Page>
  }

  if (tab === 'connectors' && selectedConnector) {
    return <Info_Page>
      <Info_Page.Header
        title={selectedConnector.name}
        titleAlign="left"
        actions={<div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => void window.electronAPI.updateConnector(workspaceId, selectedConnector.sourceSlug, { enabled: !selectedConnector.enabled }).then(refresh)}>
            {selectedConnector.enabled ? '停用' : '启用'}
          </Button>
          <HeaderIconButton icon={<Trash2 className="h-4 w-4" />} tooltip="删除连接器" onClick={() => void window.electronAPI.deleteConnector(workspaceId, selectedConnector.sourceSlug).then(refresh)} />
        </div>}
      />
      <Info_Page.Hero avatar={<Cable className="h-8 w-8" />} title={selectedConnector.name} tagline={selectedConnector.enabled ? '已启用' : '已停用'} />
      <Info_Page.Content>
        <Info_Section title="连接信息">
          <Info_Table>
            <Info_Table.Row label="类型" value={selectedConnector.driver?.toUpperCase() || 'API'} />
            <Info_Table.Row label="提供方" value={selectedConnector.provider || '自定义'} />
            <Info_Table.Row label="状态" value={selectedConnector.enabled ? '已启用' : '已停用'} />
            <Info_Table.Row label="连接状态" value={selectedConnector.connectionStatus || '未测试'} />
          </Info_Table>
        </Info_Section>
      </Info_Page.Content>
    </Info_Page>
  }

  const pageTitle = tab === 'experts' ? '专家'
    : tab === 'skills' ? '技能'
      : '连接器'

  return <div className="flex h-full min-h-0 flex-col">
    <PanelHeader
      title={pageTitle}
      titleAlign="left"
      actions={<Button size="sm" variant="ghost" onClick={() => setMarketplaceOpen(true)}><Store className="mr-1 h-4 w-4" />发现能力</Button>}
    />
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {tab === 'experts' && <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">从左侧选择一个专家查看详情，或使用标题栏的 + 创建专家。</p>}
      {tab === 'skills' && <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">从左侧选择一个技能查看完整说明、权限与来源。</p>}
      {tab === 'connectors' && <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">从左侧选择一个连接器查看详情，或使用标题栏的 + 创建连接器。</p>}
    </div>
    <Dialog open={expertDialogOpen} onOpenChange={open => { setExpertDialogOpen(open); if (!open) { setEditingExpert(null); setExpertForm(emptyExpertForm()) } }}>
      <DialogContent><DialogHeader><DialogTitle>编辑专家</DialogTitle><DialogDescription>微调自动生成的专家配置。</DialogDescription></DialogHeader><div className="grid gap-3"><Label>名称<Input value={expertForm.name} onChange={event => setExpertForm(current => ({ ...current, name: event.target.value }))} /></Label><Label>说明<Input value={expertForm.description} onChange={event => setExpertForm(current => ({ ...current, description: event.target.value }))} /></Label><Label>系统提示词<Textarea rows={4} value={expertForm.systemPrompt} onChange={event => setExpertForm(current => ({ ...current, systemPrompt: event.target.value }))} /></Label><Label>模型<Input value={expertForm.model} placeholder="可选" onChange={event => setExpertForm(current => ({ ...current, model: event.target.value }))} /></Label><Label>记忆规则<select value={expertForm.memoryRule} onChange={event => setExpertForm(current => ({ ...current, memoryRule: event.target.value as ExpertForm['memoryRule'] }))} className="mt-1 flex h-control-md w-full rounded-control border border-foreground/15 bg-transparent px-3 text-sm"><option value="inherit">继承项目与会话记忆</option><option value="project-only">仅项目记忆</option><option value="none">不使用记忆</option></select></Label><Label>连接器 ID（逗号分隔）<Input value={expertForm.connectorIds} onChange={event => setExpertForm(current => ({ ...current, connectorIds: event.target.value }))} /></Label><Label>技能标识（逗号分隔）<Input value={expertForm.skillSlugs} onChange={event => setExpertForm(current => ({ ...current, skillSlugs: event.target.value }))} /></Label></div><DialogFooter><Button variant="outline" onClick={() => { setExpertDialogOpen(false); setEditingExpert(null); setExpertForm(emptyExpertForm()) }}>取消</Button><Button onClick={() => void saveExpert()}>保存</Button></DialogFooter></DialogContent>
    </Dialog>
    <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}><DialogContent><DialogHeader><DialogTitle>分配能力</DialogTitle><DialogDescription>普通配置只显示全局、项目和专家范围；技术层级仅保留在内部诊断中。</DialogDescription></DialogHeader><div className="grid gap-4"><Label>范围<select value={assignmentTarget} onChange={event => void loadAssignment(event.target.value)} className="mt-1 flex h-control-md w-full rounded-control border border-foreground/15 bg-transparent px-3 text-sm"><option value="global">全局</option>{projects.map(project => <option key={project.config.id} value={`project:${project.config.id}`}>项目：{project.config.name}</option>)}{experts.map(expert => <option key={expert.id} value={`expert:${expert.id}`}>专家：{expert.name}</option>)}</select></Label><div><p className="mb-2 text-sm font-medium">技能</p><div className="space-y-1">{skills.map(skill => <label key={skill.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignment.skillSlugs.includes(skill.slug)} onChange={() => toggleAssignment('skillSlugs', skill.slug)} />{skill.metadata.name}</label>)}</div></div><div><p className="mb-2 text-sm font-medium">连接器</p><div className="space-y-1">{connectors.map(connector => <label key={connector.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={assignment.connectorIds.includes(connector.id)} onChange={() => toggleAssignment('connectorIds', connector.id)} />{connector.name}</label>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setAssignmentOpen(false)}>取消</Button><Button onClick={() => void saveAssignment()}>保存分配</Button></DialogFooter></DialogContent></Dialog>
    <PluginMarketplaceBrowser open={marketplaceOpen} workspaceId={workspaceId} installedPluginNames={installedPlugins.map(plugin => plugin.name)} onOpenChange={setMarketplaceOpen} onInstalled={onPluginInstalled} presentation="capabilities" />
  </div>
}
