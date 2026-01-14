export interface MenuItem {
  name: string
  slug: string
  icon: string
}

export const welcomeItems: MenuItem[] = [
  { name: 'Предложения', slug: 'welcome', icon: 'info' },
]

export const moderationItems: MenuItem[] = [
  { name: 'Игроки', slug: 'players', icon: 'players' },
  { name: 'Чат', slug: 'chat', icon: 'chat' },
  { name: 'Репорты', slug: 'reports', icon: 'reports' },
  { name: 'Проверки', slug: 'checks', icon: 'checks' },
  { name: 'Рисунки', slug: 'signs', icon: 'signs' },
  { name: 'Оповещения', slug: 'alerts', icon: 'alerts' },
  { name: 'Спальники', slug: 'sleepingbags', icon: 'sleepingbags' },
  { name: 'Муты', slug: 'mutes', icon: 'mutes' },
  { name: 'Блокировки', slug: 'bans', icon: 'bans' },
]

export const managementItems: MenuItem[] = [
  { name: 'Статистика', slug: 'statistics', icon: 'statistics' },
  { name: 'Серверы', slug: 'servers', icon: 'servers' },
  { name: 'Журнал аудита', slug: 'audit', icon: 'audit' },
]

export const projectItems: MenuItem[] = [
  { name: 'Сотрудники', slug: 'staff', icon: 'staff' },
  { name: 'Настройки', slug: 'settings', icon: 'settings' },
]

export const allItems = [...welcomeItems, ...moderationItems, ...managementItems, ...projectItems]
