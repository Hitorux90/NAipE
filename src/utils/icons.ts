/* ============================================================
   NAipE — Lucide React icon registry (Fase 1b)
   Single source of truth for icon usage.
   ============================================================ */

import { type ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  Dna,
  File,
  FileText,
  BookOpen,
  FolderOpen,
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
  Activity,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';

export type IconName =
  | 'dna'
  | 'file'
  | 'file-text'
  | 'book-open'
  | 'folder-open'
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
  | 'x'
  | 'collapse-left'
  | 'collapse-right';

type IconProps = LucideProps;
const registry: Record<IconName, ComponentType<IconProps>> = {
  'dna': Dna,
  'file': File,
  'file-text': FileText,
  'book-open': BookOpen,
  'folder-open': FolderOpen,
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
  'x': X,
  'collapse-left': PanelLeftClose,
  'collapse-right': PanelRightClose,
};

export function getIcon(name: IconName) {
  const Component = registry[name];
  if (!Component) {
    throw new Error(`Unknown icon: ${name}`);
  }
  return Component;
}

export { registry };
