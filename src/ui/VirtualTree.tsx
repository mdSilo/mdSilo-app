import { useState, useMemo, useCallback, memo } from "react";
import { Virtuoso } from "react-virtuoso";
import OverlayScroll, { useScroller } from "./OverlayScroll";
import { FlattenedTreeNode, TreeNode as TreeNodeType } from "./Tree";
import TreeNodeElement from "./TreeNodeElement";

type Props = {
  data: TreeNodeType[];
  className?: string;
  collapseAll?: boolean;
};

function VirtualTree(props: Props) {
  const { data, className, collapseAll = false } = props;

  const [closedNodeIds, setClosedNodeIds] = useState<string[]>(
    collapseAll ? data.map((node) => node.id) : [],
  );

  const onNodeClick = useCallback(
    (node: FlattenedTreeNode) =>
      node.collapsed
        ? setClosedNodeIds((closedNodeIds) =>
            closedNodeIds.filter((id) => id !== node.id),
          )
        : setClosedNodeIds((closedNodeIds) => [...closedNodeIds, node.id]),
    [],
  );

  const flattenNode = useCallback(
    (node: TreeNodeType, depth: number, result: FlattenedTreeNode[]) => {
      const { id, labelNode, children, showArrow } = node;
      const collapsed = closedNodeIds.includes(id);
      result.push({
        id,
        labelNode,
        showArrow: showArrow ?? true,
        hasChildren: (children ?? []).length > 0,
        depth,
        collapsed,
      });

      if (!collapsed && children) {
        for (const child of children) {
          flattenNode(child, depth + 1, result);
        }
      }
    },
    [closedNodeIds],
  );

  const flattenedData = useMemo(() => {
    const result: FlattenedTreeNode[] = [];
    for (const node of data) {
      flattenNode(node, 0, result);
    }
    return result;
  }, [data, flattenNode]);

  const [scroller, scrollerRef] = useScroller();

  return (
    <OverlayScroll scroller={scroller} className={className}>
      <Virtuoso
        scrollerRef={scrollerRef}
        data={flattenedData}
        computeItemKey={(index, node) => `${node.id}-${index}`}
        itemContent={(_, node) => (
          <TreeNodeElement node={node} onClick={onNodeClick} />
        )}
      />
    </OverlayScroll>
  );
}

export default memo(VirtualTree);
