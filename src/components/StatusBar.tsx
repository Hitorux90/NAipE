type Props = {
  message?: string;
  indicator?: React.ReactNode;
};

export default function StatusBar({ message = 'Ready', indicator }: Props) {
  return (
    <footer className="layout__status-bar">
      <div className="status-bar__left">
        <span className="status-bar__message">{message}</span>
      </div>
      <div className="status-bar__right">{indicator}</div>
    </footer>
  );
}
