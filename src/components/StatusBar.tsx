import { Sun, Moon } from 'lucide-react';
import { useSequenceStore } from '../store/useSequenceStore';

type Props = {
  message?: string;
  indicator?: React.ReactNode;
  rightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
};

export default function StatusBar({
  message = 'NAipE v0.1.0',
  indicator,
  rightSidebarOpen = false,
  onToggleRightSidebar,
}: Props) {
  const { theme, toggleTheme } = useSequenceStore();

  return (
    <footer className="layout__status-bar">
      <div className="status-bar__left">
        <span className="status-bar__indicator" aria-hidden="true" />
        <span className="status-bar__message">{message}</span>
      </div>
      <div className="status-bar__right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {indicator}
        {onToggleRightSidebar && (
          <button
            className="button button--ghost"
            style={{ height: '24px', padding: '0 8px', fontSize: '11px', gap: '4px' }}
            onClick={onToggleRightSidebar}
          >
            <span>{rightSidebarOpen ? 'Hide right sidebar' : 'Show right sidebar'}</span>
          </button>
        )}
        <button
          className="button button--ghost"
          style={{ height: '24px', padding: '0 8px', fontSize: '11px', gap: '4px' }}
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
        </button>
      </div>
    </footer>
  );
}
