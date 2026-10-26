const SVG_NS = 'http://www.w3.org/2000/svg'

// bisect
const fit = (el, a = 1, b = 50) => {
    const c = Math.floor(a + (b - a) / 2)
    el.style.fontSize = `${c}px`
    if (b - a === 1) return
    if (el.scrollHeight > el.clientHeight
    || el.scrollWidth > el.clientWidth) fit(el, a, c)
    else fit(el, c, b)
}

const DEFAULT_WIDTH = 540
const DEFAULT_HEIGHT = 540
const DEFAULT_PIXEL_RATIO = 2

export const resolveQuoteImageOptions = (options = {}) => {
    const writingMode = options.writingMode === 'horizontal-tb'
        || options.writingMode === 'vertical-rl'
        || options.writingMode === 'vertical-lr'
        ? options.writingMode
        : options.vertical
            ? 'vertical-rl'
            : 'horizontal-tb'

    return {
        width: options.width ?? DEFAULT_WIDTH,
        height: options.height ?? DEFAULT_HEIGHT,
        pixelRatio: options.pixelRatio ?? DEFAULT_PIXEL_RATIO,
        backgroundColor: options.backgroundColor ?? '#ffffff',
        color: options.color ?? options.textColor ?? '#000000',
        fontFamily: options.fontFamily ?? 'serif',
        fontSize: options.fontSize ?? 20,
        lineHeight: options.lineHeight ?? 1.35,
        padding: options.padding ?? 48,
        borderColor: options.borderColor ?? options.color ?? options.textColor ?? '#111827',
        borderWidth: options.borderWidth ?? 4,
        borderStyle: options.borderStyle ?? 'double',
        titleColor: options.titleColor ?? options.color ?? '#000000',
        authorColor: options.authorColor ?? options.color ?? '#4b5563',
        titleFontSize: options.titleFontSize ?? 24,
        authorFontSize: options.authorFontSize ?? 14,
        textAlign: options.textAlign ?? 'center',
        writingMode,
        direction: options.direction ?? (writingMode.startsWith('vertical') ? 'rtl' : 'ltr'),
    }
}

const html = `<style>
:host {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
}
</style>
<main style="">
    <div style="font-size: min(2em, 3rem); line-height: 1; margin-bottom: -1em">“</div>
    <div id="text" style="margin: 1em; text-wrap: pretty"></div>
    <div id="meta" style="margin: 0 1em">
        <div style="display: block; font-size: .4em;">
            <span id="author" style="-webkit-line-clamp: 1;"></span>
        </div>
        <div style="display: block; font-size: .4em;">
            <span id="progress" style="-webkit-line-clamp: 1;"></span>
        </div>
        <div style="font-size: .8em; display: block;">
            <cite id="title" style="-webkit-line-clamp: 1;"></cite>
        </div>
    </div>
</main>`

customElements.define('foliate-quoteimage', class extends HTMLElement {
    #root = this.attachShadow({ mode: 'closed' })
    constructor() {
        super()
        this.#root.innerHTML = html
    }
    async getBlob({ title, author, text, progress, options={} }) {
        this.#root.querySelector('#title').textContent = title
        this.#root.querySelector('#author').textContent = `© ${author}`
        this.#root.querySelector('#text').innerText = text
        if (progress) {
            this.#root.querySelector('#progress').textContent = `§ ${progress}` 
        }

        const opts = resolveQuoteImageOptions(options)
        const pixelRatio = opts.pixelRatio
        const width = opts.width
        const height = opts.height

        const mainEl = this.#root.querySelector('main')
        mainEl.style.color = opts.color;
        mainEl.style.width = `${width}px`
        mainEl.style.height = `${height}px`
        mainEl.style.backgroundColor = opts.backgroundColor
        // mainEl.style.fontSize = `${opts.fontSize}px`
        mainEl.style.fontFamily = opts.fontFamily
        mainEl.style.textAlign = opts.textAlign
        mainEl.style.lineHeight = opts.lineHeight
        mainEl.style.borderColor = opts.borderColor
        mainEl.style.borderStyle = opts.borderStyle
        mainEl.style.borderWidth = opts.borderWidth
        
        // FIXME: vertical/rtl writing
        // mainEl.dir = opts.direction
        // const textEl = this.#root.querySelector('#text')
        // textEl.style.writingMode = opts.writingMode
        // textEl.style.direction = opts.direction

        const metaEl = this.#root.querySelector('#meta')
        metaEl.style.fontColor = opts.titleColor
        const titleEl = this.#root.querySelector('#title')
        titleEl.style.fontSize = `${opts.fontSize}px`
        titleEl.style.fontColor = opts.titleColor
        const authorEl = this.#root.querySelector('#author')
        authorEl.style.fontSize = `${opts.fontSize * 0.8}px`
        authorEl.style.fontColor = opts.titleColor
        const progressEl = this.#root.querySelector('#progress')
        progressEl.style.fontSize = `${opts.fontSize * 0.8}px`
        progressEl.style.fontColor = opts.titleColor

        console.log('main html-0', mainEl)

        fit(mainEl)

        console.log('main html-1', mainEl)

        const img = document.createElement('img')
        return new Promise(resolve => {
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = pixelRatio * width
                canvas.height = pixelRatio * height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                canvas.toBlob(resolve)
            }
            const doc = document.implementation.createDocument(SVG_NS, 'svg')
            doc.documentElement.setAttribute('viewBox', `0 0 ${width} ${height}`)
            const obj = doc.createElementNS(SVG_NS, 'foreignObject')
            obj.setAttribute('width', width)
            obj.setAttribute('height', height)
            obj.append(doc.importNode(mainEl, true))
            doc.documentElement.append(obj)
            img.src = 'data:image/svg+xml;charset=utf-8,'
                + new XMLSerializer().serializeToString(doc)
        })
    }
})
