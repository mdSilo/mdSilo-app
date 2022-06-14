import { memo } from 'react';

type BacklinkBranchProps = {
  title: string;
};

const BacklinkBranch = (props: BacklinkBranchProps) => {
  const { title } = props;
  return <p className="py-1 text-gray-800 dark:text-gray-100">{title}</p>;
};

export default memo(BacklinkBranch);
