type Props = {
  message?: string;
  indicator?: React.ReactNode;
};

export default function StatusBar({ message = 'NAipE v0.1.0', indicator }: Props) {
  return (
    <footer className="layout__status-bar">
      <div className="status-bar__left">
        <span className="status-bar__indicator" aria-hidden="true" />
        <span className="status-bar__message">{message}</span>
      </div>
      <div className="status-bar__right">{indicator}</div>
    </footer>
  );
}
