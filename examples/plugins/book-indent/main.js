// A trusted plugin: this module runs in the app itself, see examples/plugins/README.md.
// `api` is typed by TrustedApi of @mdsilo/plugin-api.

const words = (text) =>
  (text.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []).length +
  text.replace(/[぀-ヿ㐀-鿿가-힯]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function activate(api) {
  // a hook a sandboxed plugin can't have: CSS in the pages of the books
  api.reader.addStyles('p { text-indent: 2em; }');

  // the page of the view of the manifest, drawn into the app, no frame
  api.page('words', (el, page) => {
    let live = true;
    el.style.padding = '1rem';
    el.textContent = 'Counting…';
    (async () => {
      const notes = await page.call('notes.list');
      const rows = [];
      for (const note of notes) rows.push([note, words(await page.call('notes.read', { path: note.path }))]);
      if (!live) return;
      rows.sort((a, b) => b[1] - a[1]);
      const table = document.createElement('table');
      table.className = 'table table-sm';
      for (const [note, count] of rows) {
        const tr = table.insertRow();
        const title = tr.insertCell();
        const link = document.createElement('a');
        link.className = 'link';
        link.textContent = note.title;
        link.addEventListener('click', () => page.call('app.open', { note: note.path }));
        title.append(link);
        tr.insertCell().textContent = String(count);
      }
      el.replaceChildren(table);
    })().catch((e) => {
      el.textContent = e.message;
    });
    return () => {
      live = false;
    };
  });
}
