// Live translation for the language pages (/es/, /pt/, /de/, /fr/). The game's code stays in
// English; this swaps each piece of interface text for its translation as it appears on screen,
// using the dictionary in lang/<code>/i18n.js (built from tools/i18n/strings.js). Article text,
// titles and route steps are never touched: they already come from that language's Wikipedia.
(function () {
  const D = window.I18N_DICT;
  if (!D) return;
  const exact = new Map(D.exact);
  const patterns = D.patterns.map(([re, out]) => [new RegExp(re), out]);
  const scoped = D.scoped || [];
  // Content that must never be translated: Wikipedia text, article titles, routes, typed input.
  const SKIP = '.logo, .headline.brand, .mw-parser-output, #article, #article-title, #spec-article, #spec-title, #toc-list, .node, .route-big, #path, .tname, .tdesc, .textract, #hud-target, .tv, .choice, input, textarea, script, style, .demo-text, .demo-title, .demo-trail, #demo-url, .room-code, [data-no-i18n]';

  function translate(core) {
    const hit = exact.get(core);
    if (hit != null) return hit;
    for (const [re, out] of patterns) {
      const m = core.match(re);
      if (!m) continue;
      return out.replace(/\{(\d)\}|\$(\d)/g, (_, t, raw) => {
        const v = m[Number(t || raw)] || '';
        return t ? t_(v) : v;
      });
    }
    return null;
  }
  // Translate keeping the surrounding spaces (text is often split around <b> tags).
  function t_(s, el) {
    if (!s || !/[A-Za-z]/.test(s)) return s;
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2].replace(/[ \t\n\r]+/g, ' ');
    let out = null;
    if (el) for (const [sel, en, tr] of scoped) if (core === en && el.closest(sel)) { out = tr; break; }
    if (out == null) out = translate(core);
    return out == null ? s : m[1] + out + m[3];
  }

  const done = new WeakMap(); // node → text we last wrote, so our own edits aren't re-translated
  function textNode(n) {
    const el = n.parentElement;
    if (!el || el.closest(SKIP)) return;
    const v = n.nodeValue;
    if (done.get(n) === v) return;
    const out = t_(v, el);
    done.set(n, out);
    if (out !== v) n.nodeValue = out;
  }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function attrs(el) {
    if (el.closest(SKIP) && !el.matches('input, textarea')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || (el.__i18n && el.__i18n[a] === v)) continue;
      const out = t_(v, el);
      el.__i18n = el.__i18n || {};
      el.__i18n[a] = out;
      if (out !== v) el.setAttribute(a, out);
    }
  }
  function scan(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1) return;
    attrs(root);
    if (root.closest(SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1 || !n.matches(SKIP)) return NodeFilter.FILTER_ACCEPT;
        if (n.matches('input, textarea')) attrs(n); // placeholders still get translated
        return NodeFilter.FILTER_REJECT;
      },
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) textNode(n);
      else attrs(n);
    }
  }

  window.I18N = { lang: D.lang, t: (s) => t_(s), demo: D.demo, site: D.site };
  const start = () => {
    scan(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') attrs(m.target);
        else m.addedNodes.forEach(scan);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
