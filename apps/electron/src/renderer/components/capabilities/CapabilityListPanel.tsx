import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Bot, Cable, Puzzle } from 'lucide-react'
import type { ExpertProfile } from '@craft-agent/shared/experts'
import type { Connector } from '@craft-agent/shared/connectors'
import type { LoadedSkill } from '../../../shared/types'
import { capabilityNavigatorKindAtom, selectedCapabilityIdAtom } from '@/atoms/capability-center'
import { EntityPanel } from '@/components/ui/entity-panel'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { SkillAvatar } from '@/components/ui/skill-avatar'
import { capabilitySelection } from '@/hooks/useEntitySelection'

type CapabilityListEntry =
  | { kind: 'expert'; id: string; expert: ExpertProfile }
  | { kind: 'skill'; id: string; skill: LoadedSkill }
  | { kind: 'connector'; id: string; connector: Connector }

export function CapabilityListPanel({ workspaceId, skills }: { workspaceId: string; skills: LoadedSkill[] }) {
  const kind = useAtomValue(capabilityNavigatorKindAtom)
  const [selectedId, setSelectedId] = useAtom(selectedCapabilityIdAtom)
  const [experts, setExperts] = React.useState<ExpertProfile[]>([])
  const [connectors, setConnectors] = React.useState<Connector[]>([])

  const refresh = React.useCallback(async () => {
    const [nextExperts, nextConnectors] = await Promise.all([
      window.electronAPI.listExperts(workspaceId),
      window.electronAPI.listConnectors(workspaceId),
    ])
    setExperts(nextExperts)
    setConnectors(nextConnectors)
  }, [workspaceId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const items = React.useMemo<CapabilityListEntry[]>(() => {
    if (kind === 'experts') return experts.map(expert => ({ kind: 'expert', id: expert.id, expert }))
    if (kind === 'connectors') return connectors.map(connector => ({ kind: 'connector', id: connector.id, connector }))
    return skills.map(skill => ({ kind: 'skill', id: skill.slug, skill }))
  }, [connectors, experts, kind, skills])

  React.useEffect(() => {
    setSelectedId(current => current && items.some(item => item.id === current)
      ? current
      : (items[0]?.id ?? null))
  }, [items, setSelectedId])

  const emptyCopy = kind === 'experts'
    ? ['暂无专家', '通过左上角“新建专家”创建可复用的协作专家。'] as const
    : kind === 'skills'
      ? ['暂无技能', '已安装的技能会显示在这里。'] as const
      : ['暂无连接器', '创建连接器后可分配给专家和项目。'] as const

  return (
    <EntityPanel
      items={items}
      getId={item => item.id}
      selection={capabilitySelection}
      selectedId={selectedId}
      onItemClick={item => setSelectedId(item.id)}
      containerProps={{ 'data-list-role': `capability-${kind}` }}
      emptyState={
        <EntityListEmptyScreen
          icon={kind === 'experts' ? <Bot /> : kind === 'skills' ? <Puzzle /> : <Cable />}
          title={emptyCopy[0]}
          description={emptyCopy[1]}
        />
      }
      mapItem={item => item.kind === 'expert'
        ? {
            icon: <Bot />,
            title: item.expert.name,
            badges: <span className="truncate">{item.expert.description || '通用协作专家'}</span>,
          }
        : item.kind === 'skill'
          ? {
              icon: <SkillAvatar skill={item.skill} size="sm" workspaceId={workspaceId} />,
              title: item.skill.metadata.name,
              badges: <span className="truncate">{item.skill.metadata.description}</span>,
            }
          : {
              icon: <Cable />,
              title: item.connector.name,
              badges: <span>{item.connector.enabled ? '已启用' : '已停用'} · {item.connector.connectionStatus || '未测试'}</span>,
            }}
    />
  )
}
