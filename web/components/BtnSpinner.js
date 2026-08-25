export default function BtnSpinner({ className = "" }) {
  return (
    <span
      className={`btnSpinner ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
