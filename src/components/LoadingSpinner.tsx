import { getIcon } from '../utils/icons';

export default function LoadingSpinner() {
  const SpinnerIcon = getIcon('loading');
  return (
    <span className="spinner" aria-hidden="true">
      <SpinnerIcon size={16} />
    </span>
  );
}
