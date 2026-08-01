/* ============================================================
   NAipE — Lucide React icon registry (Fase 1b)
   Single source of truth for icon usage.
   ============================================================ */

import {
  Dna,
  FileOpen,
  Save,
  Plus,
  Library,
  Settings,
  Search,
  ZoomIn,
  ZoomOut,
  Hand,
  Undo2,
  Redo2,
  Map,
  AlignLeft,
  Tag,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelRightClose,
  FolderOpen,
  Activity,
} from 'lucide-react';

export type IconName =
  | 'dna'
  | 'file-open'
  | 'save'
  | 'plus'
  | 'library'
  | 'settings'
  | 'search'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan'
  | 'undo'
  | 'redo'
  | 'map'
  | 'sequence'
  | 'features'
  | 'enzyme'
  | 'error'
  | 'warning'
  | 'info'
  | 'loading'
  | 'close'
  | 'collapse-left'
  | 'collapse-right'
  | 'folder-open'
  | 'activity';

const registry: Record<IconName, React.FC<{ size?: number; color?: string; className?: string }>> = {
  'dna': Dna,
  'file-open': FileOpen,
  'save': Save,
  'plus': Plus,
  'library': Library,
  'settings': Settings,
  'search': Search,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
  'pan': Hand,
  'undo': Undo2,
  'redo': Redo2,
  'map': Map,
  'sequence': AlignLeft,
  'features': Tag,
  'enzyme': Activity,
  'error': AlertCircle,
  'warning': AlertTriangle,
  'info': Info,
  'loading': Loader2,
  'close': X,
  'collapse-left': PanelLeftClose,
  'collapse-right': PanelRightClose,
  'folder-open': FolderOpen,
  'activity': Activity,
};

export function getIcon(name: IconName) {
  const Component = registry[name];
  if (!Component) {
    throw new Error(`Unknown icon: ${name}`);
  }
  return Component;
}

export { registry };
