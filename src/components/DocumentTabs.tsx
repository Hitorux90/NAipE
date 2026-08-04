import { getIcon } from '../utils/icons';

type Tab = { id: string; label: string; icon?: string };

interface Props {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}

export default function DocumentTabs({ tabs, activeId, onSelect, onClose }: Props) {
  return (
    <div className="doc-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon ? getIcon(tab.icon as any) : null;
        const CloseIcon = getIcon('x');
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeId === tab.id}
            className={`doc-tab${activeId === tab.id ? ' doc-tab--active' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            {Icon && <Icon size={14} />}
            <span className="doc-tab__label">{tab.label}</span>
            <span
              className="doc-tab__close"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.(tab.id);
              }}
            >
              <CloseIcon size={12} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
