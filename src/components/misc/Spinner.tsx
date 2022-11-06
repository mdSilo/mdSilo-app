type Props = {
  className?: string;
};

export default function Spinner(props: Props) {
  const { className = '' } = props;
  return (
    <div
      data-testid="spinner"
      className={`w-8 h-8 ease-linear border-4 border-t-4 border-gray-100 rounded-full animate-spin border-t-primary-500 border-r-primary-500 ${className}`}
    />
  );
}
