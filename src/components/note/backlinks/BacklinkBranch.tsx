import { memo } from 'react';

type BacklinkBranchProps = {
  title: string;
};

const BacklinkBranch = (props: BacklinkBranchProps) => {
  const { title } = props;
  return <p className="py-1 text-base-content">{title}</p>;
};

export default memo(BacklinkBranch);
