import logo from 'asset/logo.svg';

type Props = {
  width?: number;
  height?: number;
  className?: string;
  wrapperClassName?: string;
};

export default function Logo(props: Props) {
  const {
    width = 32, height = 32, className = 'rounded-sm img-effect', wrapperClassName = 'text-center p-2',
  } = props;
  return (
    <div className={wrapperClassName}>
      <img
        src={logo}
        width={width}
        height={height}
        alt="mdSilo"
        className={className}
      />
    </div>
  );
}
