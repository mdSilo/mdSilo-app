// modified from https://github.com/landakram/mdast-util-wiki-link/blob/master/src/from-markdown.js

function fromMarkdown (opts = {}) {
  const tagClassName = opts.tagClassName || '';

  function enterTag (token) {
    this.enter(
      {
        type: 'tag',
        value: null,
        data: {}
      },
      token
    )
  }

  function top (stack) {
    return stack[stack.length - 1];
  }

  function exitTagTarget (token) {
    const target = this.sliceSerialize(token);
    const current = top(this.stack);
    current.value = target;
  }

  function exitTag (token) {
    const tag = this.exit(token);

    let displayName = tag.value;
    let classNames = tagClassName;
    
    tag.data.hName = 'span';
    tag.data.hProperties = {
      className: classNames,
    }
    tag.data.hChildren = [{
      type: 'text',
      value: displayName
    }]
  }

  return {
    enter: {
      tag: enterTag
    },
    exit: {
      tagTarget: exitTagTarget,
      tag: exitTag
    }
  }
}

export { fromMarkdown }
