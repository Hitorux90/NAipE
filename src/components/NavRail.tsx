import { getIcon } from '../utils/icons';

type NavItem = { id: string; icon: string; label: string; active?: boolean };

interface Props {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function NavRail({ items, activeId, onSelect }: Props) {
  return (
    <nav className="nav-rail" aria-label="Primary">
      {items.map((item) => {
        const Icon = getIcon(item.icon as any);
        return (
          <button
            key={item.id}
            className={`nav-rail__item${activeId === item.id ? ' nav-rail__item--active' : ''}`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={activeId === item.id}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={22} />
            <span className="nav-rail__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
