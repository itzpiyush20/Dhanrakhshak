import { useCategories } from '@/context'

interface CategoryIconProps {
  name: string
  className?: string
}

export function CategoryIcon({ name, className }: CategoryIconProps) {
  const { getStyle } = useCategories()
  return <span className={className}>{getStyle(name).emoji}</span>
}

export default CategoryIcon
