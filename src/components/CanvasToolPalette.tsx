import { getIcon } from '../utils/icons';

type Tool = { id: string; icon: string; label: string };

interface Props {
  tools: Tool[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function CanvasToolPalette({ tools, activeId, onSelect }: Props) {
  return (
    <div className="tool-palette" role="toolbar" aria-label="Canvas tools">
      {tools.map((tool) => {
        const Icon = getIcon(tool.icon as any);
        return (
          <button
            key={tool.id}
            className={`tool-palette__item${activeId === tool.id ? ' tool-palette__item--active' : ''}`}
            aria-label={tool.label}
            aria-pressed={activeId === tool.id}
            onClick={() => onSelect(tool.id)}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </div>
  );
}
