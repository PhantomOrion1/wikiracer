// Dark mode for everyone unless they switched to light (the switch is top-left on the home page).
// Loaded in <head> before anything is drawn, so pages never flash light first.
(function () {
  var t = 'dark';
  try { if (localStorage.getItem('wr-theme') === 'light') t = 'light'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
})();
