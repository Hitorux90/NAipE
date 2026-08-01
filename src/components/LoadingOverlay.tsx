import LoadingSpinner from './LoadingSpinner';

type Props = {
  label?: string;
  fullscreen?: boolean;
};

export default function LoadingOverlay({ label = 'Loading…', fullscreen = false }: Props) {
  const className = fullscreen ? 'loading-overlay loading-overlay--fullscreen' : 'loading-overlay';
  return (
    <div className={className}>
      <LoadingSpinner />
      <span>{label}</span>
    </div>
  );
}
