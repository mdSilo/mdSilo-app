// https://github.com/landakram/mdast-util-wiki-link/blob/master/src/from-markdown.js

function fromMarkdown (opts = {}) {
  const permalinks = opts.permalinks || []
  const defaultPageResolver = (name) => [name.replace(/ /g, '_').toLowerCase()]
  const pageResolver = opts.pageResolver || defaultPageResolver
  const newClassName = opts.newClassName || 'new'
  const pubLinkClassName = opts.pubLinkClassName || 'internal'
  const defaultHrefTemplate = (permalink) => `#/page/${permalink}`
  const hrefTemplate = opts.hrefTemplate || defaultHrefTemplate

  function enterPubLink (token) {
    this.enter(
      {
        type: 'pubLink',
        value: null,
        data: {
          alias: null,
          permalink: null,
          exists: null
        }
      },
      token
    )
  }

  function top (stack) {
    return stack[stack.length - 1]
  }

  function exitPubLinkAlias (token) {
    const alias = this.sliceSerialize(token)
    const current = top(this.stack)
    current.data.alias = alias
  }

  function exitPubLinkTarget (token) {
    const target = this.sliceSerialize(token)
    const current = top(this.stack)
    current.value = target
  }

  function exitPubLink (token) {
    const pubLink = this.exit(token)

    const pagePermalinks = pageResolver(pubLink.value)
    let permalink = pagePermalinks.find(p => permalinks.indexOf(p) !== -1)
    const exists = permalink !== undefined
    if (!exists) {
      permalink = pagePermalinks[0]
    }
    let displayName = pubLink.value
    if (pubLink.data.alias) {
      displayName = pubLink.data.alias
    }

    let classNames = pubLinkClassName
    if (!exists) {
      classNames += ' ' + newClassName
    }

    pubLink.data.alias = displayName
    pubLink.data.permalink = permalink
    pubLink.data.exists = exists

    pubLink.data.hName = 'a'
    pubLink.data.hProperties = {
      className: classNames,
      href: hrefTemplate(permalink)
    }
    pubLink.data.hChildren = [{
      type: 'text',
      value: displayName
    }]
  }

  return {
    enter: {
      pubLink: enterPubLink
    },
    exit: {
      pubLinkTarget: exitPubLinkTarget,
      pubLinkAlias: exitPubLinkAlias,
      pubLink: exitPubLink
    }
  }
}

export { fromMarkdown }
