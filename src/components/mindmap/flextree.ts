/* eslint-disable @typescript-eslint/no-explicit-any */
import * as d3 from 'd3';

// Node-link tree diagram using the Reingold-Tilford "tidy" algorithm,
// as improved by A.J. van der Ploeg, 2013, "Drawing Non-layered Tidy
// Trees in Linear Time".
export function flextree() {
  const hierarchy = d3.layout.hierarchy().sort(null).value(null);

  // The spacing between nodes can be specified in one of two ways:
  // - separation - returns center-to-center distance
  //   in units of root-node-x-size
  // - spacing - returns edge-to-edge distance in the same units as
  //   node sizes
  let separation: any = d3_layout_treeSeparation,
      spacing: any = null,
      size: any = [1, 1],    // x_size, y_size
      nodeSize: any = null,
      setNodeSizes = false;

  // This stores the x_size of the root node, for use with the spacing 
  // function
  let wroot: any = null;

  // The main layout function:
  function tree(d: any, i: any) {
    const nodes = hierarchy.call(tree, d, i),
        t = nodes[0],
        wt = wrapTree(t);

    wroot = wt;
    zerothWalk(wt, 0);
    firstWalk(wt);
    secondWalk(wt, 0);
    renormalize(wt);

    return nodes;
  }

  // Every node in the tree is wrapped in an object that holds data
  // used during the algorithm
  function wrapTree(t: any) {
    const wt: any = {
      t: t,
      prelim: 0,
      mod: 0, 
      shift: 0, 
      change: 0,
      msel: 0,
      mser: 0,
    };
    t.x = 0;
    t.y = 0;
    if (size) {
      wt.x_size = 1;
      wt.y_size = 1;
    }
    else if (nodeSize && typeof nodeSize == "object") {  // fixed array
      wt.x_size = nodeSize[0];
      wt.y_size = nodeSize[1];
    }
    else {  // use nodeSize function
      const ns = nodeSize(t);
      wt.x_size = ns[0];
      wt.y_size = ns[1];
    }
    if (setNodeSizes) {
      t.x_size = wt.x_size;
      t.y_size = wt.y_size;
    }

    const children: any[] = [];
    const num_children = t.children ? t.children.length : 0;
    for (let i = 0; i < num_children; ++i) {
      children.push(wrapTree(t.children[i]));
    }
    wt.children = children;
    wt.num_children = num_children;

    return wt;
  }

  // Recursively set the y coordinate of the children, based on
  // the y coordinate of the parent, and its height. Also set parent 
  // and depth.
  function zerothWalk(wt: any, initial: any) {
    wt.t.y = initial;
    wt.t.depth = 0;
    _zerothWalk(wt);
  }
  
  function _zerothWalk(wt: any) {
    const kid_y: any = wt.t.y + wt.y_size,
        kid_depth: any = wt.t.depth + 1;
    for (let i = 0; i < wt.children.length; ++i) {
      const kid = wt.children[i];
      kid.t.y = kid_y;
      kid.t.parent = wt.t;
      kid.t.depth = kid_depth;
      _zerothWalk(wt.children[i]);
    }
  }

  function firstWalk(wt: any) {
    if (wt.num_children == 0) {
      setExtremes(wt);
      return;
    }
    firstWalk(wt.children[0]);

    let ih = updateIYL(bottom(wt.children[0].el), 0, null);

    for (let i = 1; i < wt.num_children; ++i) {
      firstWalk(wt.children[i]);

      // Store lowest vertical coordinate while extreme nodes still point 
      // in current subtree.
      const minY = bottom(wt.children[i].er);                                
      separate(wt, i, ih);
      ih = updateIYL(minY, i, ih);                                     
    }
    positionRoot(wt);
    setExtremes(wt);
  }

  function setExtremes(wt: any) {
    if (wt.num_children == 0) {
      wt.el = wt;
      wt.er = wt;
      wt.msel = wt.mser = 0;
    }
    else {
      wt.el = wt.children[0].el; 
      wt.msel = wt.children[0].msel;
      wt.er = wt.children[wt.num_children - 1].er; 
      wt.mser = wt.children[wt.num_children - 1].mser;
    }
  }

  function separate(wt: any, i: any, ih: any) {
    // Right contour node of left siblings and its sum of modifiers.  
    let sr = wt.children[i-1]; 
    let mssr = sr.mod;
   
    // Left contour node of current subtree and its sum of modifiers.  
    let cl = wt.children[i]; 
    let mscl = cl.mod;
   
    while (sr != null && cl != null) {
      if (bottom(sr) > ih.lowY) ih = ih.nxt;
    
      // How far to the left of the right side of sr is the left side 
      // of cl? First compute the center-to-center distance, then add 
      // the "gap" (separation or spacing)
      let dist = (mssr + sr.prelim) - (mscl + cl.prelim);
      if (separation != null) {
        dist += separation(sr.t, cl.t) * wroot.x_size;
      }
      else if (spacing != null) {
        dist += sr.x_size/2 + cl.x_size/2 + spacing(sr.t, cl.t);
      }
      if (dist > 0) {
        mscl += dist;
        moveSubtree(wt, i, ih.index, dist);
      }

      // Fix for layout bug, https://github.com/Klortho/d3-flextree/issues/1,
      // HT @lianyi
      else if ( i === 1 && mscl === 0 && 
                sr.num_children === 0 && cl.num_children > 1 && dist < 0 ) {
        mscl += dist;
        moveSubtree(wt, i, ih.index, dist);
      }

      const sy = bottom(sr), 
          cy = bottom(cl);
    
      // Advance highest node(s) and sum(s) of modifiers  
      if (sy <= cy) {                                                    
        sr = nextRightContour(sr);
        if (sr != null) mssr += sr.mod;
      }                                                               
      if (sy >= cy) {                                           
        cl = nextLeftContour(cl);
        if (cl != null) mscl += cl.mod;
      }
    }

    // Set threads and update extreme nodes. In the first case, the 
    // current subtree must be taller than the left siblings.  
    if (sr == null && cl != null) setLeftThread(wt, i, cl, mscl);
    
    // In this case, the left siblings must be taller than the current 
    // subtree.  
    else if (sr != null && cl == null) setRightThread(wt, i, sr, mssr);
  }

  function moveSubtree(wt: any, i: any, si: any, dist: any) {
    // Move subtree by changing mod.  
    wt.children[i].mod += dist; 
    wt.children[i].msel += dist; 
    wt.children[i].mser += dist;
    distributeExtra(wt, i, si, dist);                                  
  }

  function nextLeftContour(wt: any) {
    return wt.num_children == 0 ? wt.tl : wt.children[0];
  }
    
  function nextRightContour(wt: any) {
    return wt.num_children == 0 ? 
      wt.tr : wt.children[wt.num_children - 1];
  }
    
  function bottom(wt: any) { 
    return wt.t.y + wt.y_size; 
  }
  
  function setLeftThread(wt: any, i: any, cl: any, modsumcl: any) {
    const li = wt.children[0].el;
    li.tl = cl;
   
    // Change mod so that the sum of modifier after following thread 
    // is correct.  
    const diff = (modsumcl - cl.mod) - wt.children[0].msel;
    li.mod += diff; 
   
    // Change preliminary x coordinate so that the node does not move.  
    li.prelim -= diff;
   
    // Update extreme node and its sum of modifiers.  
    wt.children[0].el = wt.children[i].el; 
    wt.children[0].msel = wt.children[i].msel;
  }
    
  // Symmetrical to setLeftThread.  
  function setRightThread(wt: any, i: any, sr: any, modsumsr: any) {
    const ri = wt.children[i].er;
    ri.tr = sr;
    const diff = (modsumsr - sr.mod) - wt.children[i].mser;
    ri.mod += diff; 
    ri.prelim -= diff;
    wt.children[i].er = wt.children[i - 1].er; 
    wt.children[i].mser = wt.children[i - 1].mser;
  }

  // Position root between children, taking into account their mod.  
  function positionRoot(wt: any) {
    wt.prelim = ( wt.children[0].prelim + 
                  wt.children[0].mod -
                  wt.children[0].x_size/2 +
                  wt.children[wt.num_children - 1].mod + 
                  wt.children[wt.num_children - 1].prelim +
                  wt.children[wt.num_children - 1].x_size/2) / 2;
  }

  function secondWalk(wt: any, modsum: any) {
    modsum += wt.mod;
    // Set absolute (non-relative) horizontal coordinate.  
    wt.t.x = wt.prelim + modsum;
    addChildSpacing(wt);                                               
    for (let i = 0; i < wt.num_children; i++) 
      secondWalk(wt.children[i], modsum);
  }

  function distributeExtra(wt: any, i: any, si: any, dist: any) {
    // Are there intermediate children?
    if (si != i - 1) {                                                    
      const nr = i - si;                                            
      wt.children[si + 1].shift += dist / nr;                                     
      wt.children[i].shift -= dist / nr;                                         
      wt.children[i].change -= dist - dist / nr;                                 
    }                                                                 
  }                                                                    
   
  // Process change and shift to add intermediate spacing to mod.  
  function addChildSpacing(wt: any) {
    let d = 0, modsumdelta = 0;                                    
    for (let i = 0; i < wt.num_children; i++) {                                  
      d += wt.children[i].shift;                                               
      modsumdelta += d + wt.children[i].change;                                
      wt.children[i].mod += modsumdelta;                                       
    }                                                                 
  }                                                                    

  // Make/maintain a linked list of the indexes of left siblings and their 
  // lowest vertical coordinate.  
  function updateIYL(minY: any, i: any, ih: any) {
    // Remove siblings that are hidden by the new subtree.  
    while (ih != null && minY >= ih.lowY) ih = ih.nxt;                 
    // Prepend the new subtree.  
    return {
      lowY: minY, 
      index: i, 
      nxt: ih,
    };                                       
  }         

  // Renormalize the coordinates
  function renormalize(wt: any) {

    // If a fixed tree size is specified, scale x and y based on the extent.
    // Compute the left-most, right-most, and depth-most nodes for extents.
    if (size != null) {
      let left = wt,
          right = wt,
          bottom = wt;
      let toVisit = [wt],
          node;
      // eslint-disable-next-line no-cond-assign
      while (node = toVisit.pop()) {
        const t = node.t;
        if (t.x < left.t.x) left = node;
        if (t.x > right.t.x) right = node;
        if (t.depth > bottom.t.depth) bottom = node;
        if (node.children) 
          toVisit = toVisit.concat(node.children);
      }

      const sep = separation == null ? 0.5 : separation(left.t, right.t)/2;
      const tx = sep - left.t.x;
      const kx = size[0] / (right.t.x + sep + tx);
      const ky = size[1] / (bottom.t.depth > 0 ? bottom.t.depth : 1);

      toVisit = [wt];
      // eslint-disable-next-line no-cond-assign
      while (node = toVisit.pop()) {
        const t = node.t;
        t.x = (t.x + tx) * kx;
        t.y = t.depth * ky;
        if (setNodeSizes) {
          t.x_size *= kx;
          t.y_size *= ky;
        }
        if (node.children) 
          toVisit = toVisit.concat(node.children);
      }
    }

    // Else either a fixed node size, or node size function was specified.
    // In this case, we translate such that the root node is at x = 0.
    else {
      const rootX = wt.t.x;
      moveRight(wt, -rootX);
    }
  }

  function moveRight(wt: any, move: any) {
    wt.t.x += move;
    for (let i = 0; i < wt.num_children; ++i) {
      moveRight(wt.children[i], move);
    }
  }

  // Setter and getter methods

  tree.separation = function(x: any) {
    if (!arguments.length) return separation;
    separation = x;
    spacing = null;
    return tree;
  };

  tree.spacing = function(x: any) {
    if (!arguments.length) return spacing;
    spacing = x;
    separation = null;
    return tree;
  }

  tree.size = function(x: any) {
    if (!arguments.length) return size;
    size = x;
    nodeSize = null;
    return tree;
  };

  tree.nodeSize = function(x: any) {
    if (!arguments.length) return nodeSize;
    nodeSize = x;
    size = null;
    return tree;
  };

  tree.setNodeSizes = function(x: any) {
    if (!arguments.length) return setNodeSizes;
    setNodeSizes = x;
    return tree;
  };

  tree.rootXSize = function() {
    return wroot ? wroot.x_size : null;
  }

  return d3_layout_hierarchyRebind(tree, hierarchy);
}

function d3_layout_treeSeparation(a: any, b: any) {
  return a.parent == b.parent ? 1 : 2;
}
function d3_layout_hierarchyRebind(object: any, hierarchy: any) {
  d3.rebind(object, hierarchy, "sort", "children", "value");

  // Add an alias for nodes and links, for convenience.
  object.nodes = object;
  object.links = d3_layout_hierarchyLinks;

  return object;
}

function d3_layout_hierarchyLinks(nodes: any) {
  return d3.merge(nodes.map((parent: any) => {
    return (parent.children || []).map((child: any) => {
      return {source: parent, target: child};
    });
  }));
}
