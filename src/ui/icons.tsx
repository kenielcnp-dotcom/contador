import {
  Briefcase,
  Bus,
  CirclePlus,
  Droplet,
  Ellipsis,
  Fuel,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  PartyPopper,
  PawPrint,
  Percent,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  Utensils,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  home: House,
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  droplet: Droplet,
  zap: Zap,
  wifi: Wifi,
  bus: Bus,
  fuel: Fuel,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  'party-popper': PartyPopper,
  repeat: Repeat,
  'shopping-bag': ShoppingBag,
  landmark: Landmark,
  'paw-print': PawPrint,
  ellipsis: Ellipsis,
  briefcase: Briefcase,
  laptop: Laptop,
  percent: Percent,
  tag: Tag,
  'trending-up': TrendingUp,
  'plus-circle': CirclePlus,
};

export const CATEGORY_ICON_CHOICES = Object.keys(CATEGORY_ICONS);

export function CategoryIcon({ name, size = 18 }: { name: string | null | undefined; size?: number }) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  return <Icon size={size} aria-hidden />;
}
