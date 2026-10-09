import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeLanguage, type Language } from '@/lib/i18n'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('Language')}>
          <Languages size={16} />
          <span>{i18n.resolvedLanguage === 'zh-CN' ? '简体中文' : 'English'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={i18n.resolvedLanguage}
          onValueChange={(value) => void changeLanguage(value as Language)}
        >
          <DropdownMenuRadioItem value="zh-CN" lang="zh-CN">
            简体中文
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en" lang="en">
            English
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
