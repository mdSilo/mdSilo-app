type Props = {
  className?: string;
};

export default function Spinner(props: Props) {
  const { className = '' } = props;
  return (
    <div
      data-testid="spinner"
      className={`ease-linear border-4 border-t-4 border-base-300 rounded-full animate-spin border-t-primary border-r-primary ${className}`}
    />
  );
}
