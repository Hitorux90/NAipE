import { getIcon } from '../utils/icons';

type Props = {
  message: string;
  icon?: string;
};

export default function EmptyState({ message, icon = 'info' }: Props) {
  const Icon = getIcon(icon as any);
  return (
    <div className="empty-state">
      {Icon && <Icon size={32} />}
      <span>{message}</span>
    </div>
  );
}
