import { useState } from 'react';
import { getIcon } from '../utils/icons';

type Props = {
  message: string;
  onDismiss?: () => void;
};

export default function ErrorBanner({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);
  const ErrorIcon = getIcon('error');
  const CloseIcon = getIcon('close');

  if (!visible) return null;

  return (
    <div className="error-banner" role="alert">
      <span className="error-banner__icon">
        <ErrorIcon size={20} />
      </span>
      <span className="error-banner__message">{message}</span>
      <button
        className="error-banner__close"
        aria-label="Dismiss"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
