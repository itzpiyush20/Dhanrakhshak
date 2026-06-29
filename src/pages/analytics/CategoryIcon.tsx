import React from 'react'
import {
  Utensils,
  ShoppingCart,
  Car,
  ShoppingBag,
  Lightbulb,
  Home,
  Activity,
  Film,
  GraduationCap,
  Plane,
  RefreshCw,
  ArrowLeftRight,
  Coins,
  Laptop,
  TrendingUp,
  Undo2,
  Gift,
  Pin,
  HelpCircle
} from 'lucide-react'

export const CategoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  food: Utensils,
  groceries: ShoppingCart,
  transport: Car,
  shopping: ShoppingBag,
  utilities: Lightbulb,
  rent: Home,
  health: Activity,
  entertainment: Film,
  education: GraduationCap,
  travel: Plane,
  subscriptions: RefreshCw,
  transfers: ArrowLeftRight,
  salary: Coins,
  freelance: Laptop,
  investments: TrendingUp,
  refund: Undo2,
  cashback: Gift,
  other: Pin,
}

interface CategoryIconProps {
  name: string
  className?: string
}

export function CategoryIcon({ name, className }: CategoryIconProps) {
  const IconComponent = CategoryIconMap[name] || HelpCircle
  return <IconComponent className={className} />
}

export default CategoryIcon
