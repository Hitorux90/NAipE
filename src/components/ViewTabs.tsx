import { getIcon } from '../utils/icons';

type ViewTab = { id: string; label: string; icon?: string };

interface Props {
  tabs: ViewTab[];
  active: string;
  onChange: (id: string) => void;
}

export default function ViewTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="view-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon ? getIcon(tab.icon as any) : null;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`view-tab${active === tab.id ? ' view-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {Icon && <Icon size={14} />}
            <span className="view-tab__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
