import { FileArchive, FolderOpen, Plus, ShoppingBag, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'

const CHROME_EXTENSION_STORE = 'https://chromewebstore.google.com/category/extensions'
const MICROSOFT_EXTENSION_STORE = 'https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home'

interface BrowserExtensionInstallMenuProps {
  onOpenStore: (url: string) => void
}

export function BrowserExtensionInstallMenu({ onOpenStore }: BrowserExtensionInstallMenuProps) {
  const { t } = useTranslation()

  const installLocal = async (mode: 'directory' | 'files') => {
    try {
      const [path] = await window.electronAPI.openFileDialog({
        mode,
        title: mode === 'directory' ? '选择解压后的扩展目录' : '选择 CRX 或 ZIP 扩展包',
      })
      if (!path) return
      await window.electronAPI.browserPane.installExtension(path)
      window.dispatchEvent(new Event('craft-browser-extensions-changed'))
      toast.success(t('plugins.browserExtensionInstalled', { defaultValue: '扩展已安装' }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('plugins.browserExtensionInstallFailed', { defaultValue: '扩展安装失败' }))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <HeaderIconButton
          icon={<Plus className="h-4 w-4" />}
          tooltip="添加扩展"
          aria-label="添加扩展"
        />
      </DropdownMenuTrigger>
      <StyledDropdownMenuContent align="end" minWidth="min-w-[180px]">
        <StyledDropdownMenuItem onSelect={() => onOpenStore(CHROME_EXTENSION_STORE)}>
          <ShoppingBag className="h-4 w-4" />
          <span>谷歌商店</span>
        </StyledDropdownMenuItem>
        <StyledDropdownMenuItem onSelect={() => onOpenStore(MICROSOFT_EXTENSION_STORE)}>
          <Store className="h-4 w-4" />
          <span>微软商店</span>
        </StyledDropdownMenuItem>
        <StyledDropdownMenuItem onSelect={() => { void installLocal('directory') }}>
          <FolderOpen className="h-4 w-4" />
          <span>解压插件</span>
        </StyledDropdownMenuItem>
        <StyledDropdownMenuItem onSelect={() => { void installLocal('files') }}>
          <FileArchive className="h-4 w-4" />
          <span>导入插件</span>
        </StyledDropdownMenuItem>
      </StyledDropdownMenuContent>
    </DropdownMenu>
  )
}
