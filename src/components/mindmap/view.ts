/* eslint-disable import/no-named-as-default-member */
/* eslint-disable @typescript-eslint/no-explicit-any */

import d3 from 'd3';
import { flextree } from './flextree';

function getTextWidth(text: any, font: any) {
  // re-use canvas object for better performance
  const canvas = (getTextWidth as any).canvas || 
    ((getTextWidth as any).canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  const metrics = context.measureText(text);
  return metrics.width;
}

function traverseBranchId(node: any, branch: number, state: any) {
  // console.log("branch", branch)
  if (!("branch" in node)) {
    node.branch = branch;
  }
  if (node.children) {
    node.children.forEach((d: any, i: number) => {
      // console.log("sub i", i)
      traverseBranchId(d, i + branch, state);
    });
  }
}

function traverseDummyNodes(node: any) {
  if (node.children) {
    node.children.forEach(traverseDummyNodes);

    node.children = [{
      name: '',
      dummy: true,
      children: node.children
    }];
  }
}

function traverseTruncateLabels(node: any, length: any) {
  if (node.name.length > length) {
    node.name = node.name.slice(0, length - 1) + '\u2026';
  }
  if (node.children) {
    node.children.forEach((n: any) => {
      traverseTruncateLabels(n, length);
    });
  }
}

function Markmap(svg: any, data: any, options: any) {
  // @ts-expect-error all
  if (!(this instanceof Markmap)) return new (Markmap as any)(svg, data, options);
  // @ts-expect-error all
  this.init(svg, data, options);
  return svg
}

const defaultPreset = {
  nodeHeight: 20,
  nodeWidth: 180,
  nodePadding: 12,
  spacingVertical: 5,
  spacingHorizontal: 60,
  truncateLabels: 0,
  duration: 750,
  layout: 'tree',
  color: 'gray',
  linkShape: 'diagonal',
  renderer: 'boxed'
};

Object.assign(Markmap.prototype, {
  getInitialState: function() {
    return {
      zoomScale: 1,
      zoomTranslate: [0, 0],
      autoFit: true,
      depthMaxSize: {},
      yByDepth: {},
      nodeFont: '10px sans-serif'
    };
  },
  presets: {
    'default': defaultPreset,
    'colorful': Object.assign(Object.assign({}, defaultPreset), {
      nodeHeight: 10,
      renderer: 'basic',
      color: 'category20',
      nodePadding: 6
    })
  },
  helperNames: ['layout', 'linkShape', 'color'],
  layouts: {
    tree: function(self: any) {
      return flextree()
        .setNodeSizes(true)
        .nodeSize(function(d: any) {
          let width = d.dummy ? self.state.spacingHorizontal : getTextWidth(d.name, self.state.nodeFont);
          if (!d.dummy && width > 0) {
            // Add padding non-empty nodes
            width += 2 * self.state.nodePadding;
          }
          return [self.state.nodeHeight, width];
        })
        .spacing(function(a: any, b: any) {
          return a.parent == b.parent ? self.state.spacingVertical : self.state.spacingVertical*2;
        })
    }
  },
  linkShapes: {
    diagonal: function() {
      return d3.svg.diagonal()
        .projection(function(d: any) { return [d.y, d.x]; });
    },
    bracket: function() {
      return function(d: any) {
        return "M" + d.source.y + "," + d.source.x
            + "V" + d.target.x + "H" + d.target.y;
      };
    }
  },
  colors: Object.assign(
    {gray: function() {return function() {return '#929292';}}},
    d3.scale
  ),
  init: function(svg: any, data: any, options: any) {
    options = options || {};

    svg = svg.datum ? svg : d3.select(svg);

    // @ts-expect-error all
    this.helpers = {};
    // @ts-expect-error all
    this.i = 0;
    // @ts-expect-error all
    const state = this.state = this.getInitialState();
    // @ts-expect-error all
    this.set(this.presets[options.preset || 'default']);
    // @ts-expect-error all
    state.height = svg.node().getBoundingClientRect().height;
    // @ts-expect-error all
    state.width = svg.node().getBoundingClientRect().width;
    this.set(options);

    // disable panning using right mouse button
    svg.on("mousedown", function() {
      const ev: any = d3.event;
      if (ev.button === 2) {
        ev.stopImmediatePropagation();
      }
    });
    // @ts-expect-error all
    const zoom = this.zoom = d3.behavior.zoom()
       .on("zoom", function() {
        // @ts-expect-error all
         this.updateZoom(d3.event.translate, d3.event.scale);
       }.bind(this));

    // @ts-expect-error all
    this.svg = svg
      .call(zoom)
      .append("g");

    this.updateZoom(state.zoomTranslate, state.zoomScale);

    this.setData(data);
    // @ts-expect-error all
    this.update(state.root);

    if (options.autoFit === undefined || options.autoFit === null) {
      state.autoFit = false;
    }
  },
  
  updateZoom: function(translate: any, scale: any) {
    // @ts-expect-error all
    const state = this.state;
    state.zoomTranslate = translate;
    state.zoomScale = scale;
    // @ts-expect-error all
    this.zoom.translate(state.zoomTranslate)
        .scale(state.zoomScale);
    // @ts-expect-error all
    this.svg.attr("transform", "translate(" + state.zoomTranslate + ")" + " scale(" + state.zoomScale + ")")
  },
  set: function(values: any) {
    if (values.preset) {
      // @ts-expect-error all
      this.set(this.presets[values.preset]);
    }
    // @ts-expect-error all
    const state = this.state;
    // @ts-expect-error all
    const helpers = this.helpers;
    this.helperNames.forEach(function(h: any) {
      if (!helpers[h] || (values[h] && values[h] !== state[h])) {
        // @ts-expect-error all
        helpers[h] = this[h+'s'][values[h] || state[h]](this);
      }
    }.bind(this));
    Object.assign(state, values || {});
    return this;
  },
  preprocessData(data: any, prev: any) {
    // @ts-expect-error all
    const state = this.state;

    if (state.truncateLabels) {
      traverseTruncateLabels(data, state.truncateLabels);
    }

    if (data.children) {
      data.children.forEach((d: any, i: number) => {
        // console.log("i", i)
        traverseBranchId(d, i, state);
      });
    }

    if (prev) {
      this.diffTreeState(data, prev);
    }
  },
  setData: function(data: any) {
    // @ts-expect-error all
    const state = this.state;
    // console.log("data", data)
    this.preprocessData(data, state.root);

    state.root = data;
    state.root.x0 = state.height / 2;
    state.root.y0 = 0;

    return this;
  },
  diffTreeState: function(next: any, prev: any) {
    const childrenNext = next.children;
    const childrenPrev = prev.children || prev._children;

    if (childrenNext && childrenPrev) {
      // if number of children is different (nodes we likely added or removed) we create a name based index
      // else we use position based comparison as nodes were likely just renamed
      let idx;
      if (childrenNext.length !== childrenPrev.length) {
        idx = childrenPrev.reduce(function(res: any, node: any) {
          res[node.name] = res[node.name] || [];
          res[node.name].push(node);
          return res;
        }, {});
      }

      for (let k = 0; k < childrenNext.length; k += 1) {
        let child;
        if (idx) {
          const nodes = idx[childrenNext[k].name];
          if (nodes) {
            child = nodes[0];
            idx[childrenNext[k].name] = nodes.slice(1);
          }
        } else {
          child = childrenPrev[k];
        }

        if (child) {
          this.diffTreeState(childrenNext[k], child);
        }
      }

      if (prev._children) {
        next._children = next.children;
        delete next.children;
      }
    }

    return next;
  },
  update: function(source: any) {
    // @ts-expect-error all
    const state = this.state;
    source = source || state.root;
    const res = this.layout(state);
    if (state.autoFit) {
      const minX = d3.min(res.nodes, function(d: any) {return d.x;});
      const minY = d3.min(res.nodes, function(d: any) {return d.y;});
      const maxX = d3.max(res.nodes, function(d: any) {return d.x;});
      const maxY = d3.max(res.nodes, function(d: any) {return d.y + d.y_size;});
      const realHeight = maxX - minX;
      const realWidth = maxY - minY;
      const scale = Math.min(state.height / realHeight, state.width / realWidth, 1);
      const translate = [
        (state.width-realWidth*scale)/2-minY*scale,
        (state.height-realHeight*scale)/2-minX*scale
      ];
      this.updateZoom(translate, scale);
    }
    this.render(source, res.nodes, res.links);
    return this;
  },
  layout: function(state: any) {
    // @ts-expect-error all
    const layout = this.helpers.layout;

    if (state.linkShape !== 'bracket') {
      // Fill in with dummy nodes to handle spacing for layout algorithm
      traverseDummyNodes(state.root);
    }

    // Compute the new tree layout.
    let nodes = layout.nodes(state.root).reverse();

    // Remove dummy nodes after layout is computed
    nodes = nodes.filter(function(n: any) { return !n.dummy; });
    nodes.forEach(function(n: any) {
      if (n.children && n.children.length === 1 && n.children[0].dummy) {
        n.children = n.children[0].children;
      }
      if (n.parent && n.parent.dummy) {
        n.parent = n.parent.parent;
      }
    });

    if (state.linkShape === 'bracket') {
      nodes.forEach(function(n: any) {
        n.y += n.depth * state.spacingHorizontal;
      });
    }

    const links = layout.links(nodes);

    return {
      nodes: nodes,
      links: links
    };
  },
  render: function(source: any, nodes: any, links: any) {
    // @ts-expect-error all
    this.renderers[this.state.renderer].call(this, source, nodes, links);
  },
  renderers: {
    boxed: function(source: any, nodes: any, links: any) {
      // @ts-expect-error all
      const svg = this.svg;
      // @ts-expect-error all
      const state = this.state;
      // @ts-expect-error all
      const color = this.helpers.color;
      // @ts-expect-error all
      this.renderers.basic.call(this, source, nodes, links);
      const node = svg.selectAll("g.markmap-node");

      node.select('rect')
        .attr("y", -state.nodeHeight/2)
        .attr('rx', 10)
        .attr('ry', 10)
        .attr('height', state.nodeHeight)
        .attr('fill', (d: any) => { return d3.rgb(color(d.branch)).brighter(1.2); })
        .attr('stroke', (d: any) => { return color(d.branch); })
        .attr('stroke-width', 1);

      node.select('text')
       .attr("dy", "3")

      svg.selectAll("path.markmap-link").attr('stroke-width', 1);
    },
    basic: function(source: any, nodes: any, links: any) {
      // @ts-expect-error all
      const svg = this.svg;
      // @ts-expect-error all
      const state = this.state;
      // @ts-expect-error all
      const color = this.helpers.color;
      // @ts-expect-error all
      const linkShape = this.helpers.linkShape;

      function linkWidth(d: any) {
        let depth = d.depth;
        if (d.name !== '' && d.children && d.children.length === 1 && d.children[0].name === '') {
          depth += 1;
        }
        return Math.max(6 - 2*depth, 1.5);
      }

      // Update the nodes…
      const node = svg.selectAll("g.markmap-node")
          // @ts-expect-error all
          .data(nodes, function(d: any) { return d.id || (d.id = ++this.i); }.bind(this));

      // Enter any new nodes at the parent's previous position.
      const nodeEnter = node.enter().append("g")
          .attr("class", "markmap-node")
          .attr("transform", function(d: any) { 
            return "translate(" + (source.y0 + source.y_size - d.y_size) + "," + source.x0 + ")"; 
          })
          // @ts-expect-error all
          .on("click", this.click.bind(this));

      nodeEnter.append('rect')
        .attr('class', 'markmap-node-rect')
        .attr("y", (d: any) => { return -linkWidth(d) / 2 })
        .attr('x', function(d: any) { return d.y_size; })
        .attr('width', 0)
        .attr('height', linkWidth)
        .attr('fill', (d: any) => { return color(d.branch); });

      nodeEnter.append("circle")
        .attr('class', 'markmap-node-circle')
        .attr('cx', (d: any) => d.y_size)
        .attr('stroke', (d: any) => color(d.branch))
        .attr("r", 1e-6)
        .style("fill", (d: any) => d._children ? color(d.branch) : '');

      nodeEnter.append("text")
        .attr('class', 'markmap-node-text')
        .attr("x", (d: any) => d.y_size)
        .attr("dy", "-5")
        .attr("text-anchor", () => "start")
        .text((d: any) => d.name)
        .style("fill-opacity", 1e-6);

      // Transition nodes to their new position.
      const nodeUpdate = node.transition()
        .duration(state.duration)
        .attr("transform", (d: any) => "translate(" + d.y + "," + d.x + ")");

      nodeUpdate.select('rect')
        .attr('x', -1)
        .attr('width', (d: any) => d.y_size + 2);

      nodeUpdate.select("circle")
        .attr("r", 4.5)
        .style("fill", (d: any) => d._children ? color(d.branch) : '')
        .style('display', (d: any) => {
          const hasChildren = d.href || d.children || d._children;
          return hasChildren ?  'inline' : 'none';
        });

      nodeUpdate.select("text")
        .attr("x", 10)
        .style("fill-opacity", 1);

      // Transition exiting nodes to the parent's new position.
      const nodeExit = node.exit().transition()
        .duration(state.duration)
        .attr(
          "transform", 
          (d: any) => "translate(" + (source.y + source.y_size - d.y_size) + "," + source.x + ")"
        )
        .remove();

      nodeExit.select('rect')
        .attr('x', (d: any) => d.y_size)
        .attr('width', 0);

      nodeExit.select("circle").attr("r", 1e-6);

      nodeExit.select("text")
        .style("fill-opacity", 1e-6)
        .attr("x", (d: any) => d.y_size);

      // Update the links…
      const link = svg.selectAll("path.markmap-link")
        .data(links, (d: any) => d.target.id);

      // Enter any new links at the parent's previous position.
      link.enter().insert("path", "g")
        .attr("class", "markmap-link")
        .attr('stroke', (d: any) => { /* console.log("d",d);  */return color(d.target.branch);})
        .attr('stroke-width', (l: any) => linkWidth(l.target))
        .attr("d", () => {
          const o = {x: source.x0, y: source.y0 + source.y_size};
          return linkShape({source: o, target: o});
        });

      // Transition links to their new position.
      link.transition()
        .duration(state.duration)
        .attr("d", (d: any) => {
          const s = {x: d.source.x, y: d.source.y + d.source.y_size};
          const t = {x: d.target.x, y: d.target.y};
          return linkShape({source: s, target: t});
        });

      // Transition exiting nodes to the parent's new position.
      link.exit().transition()
        .duration(state.duration)
        .attr("d", () => {
          const o = {x: source.x, y: source.y + source.y_size};
          return linkShape({source: o, target: o});
        })
        .remove();

      // Stash the old positions for transition.
      nodes.forEach((d: any) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }
  },
  // Toggle children on click.
  click: function(d: any) {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else {
      d.children = d._children;
      d._children = null;
    }
    this.update(d);
  }

});


export default Markmap;
