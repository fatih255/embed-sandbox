// The hostile page's own scripts: a Preact 10 app with global option hooks,
// some background noise, and a late, duplicated embed.js install.
(function () {
  var preact = window.preact;

  // Global Preact hooks rewrite every element this copy of Preact renders.
  // If the widget shared this Preact instance, its markup would change too.
  preact.options.vnode = function (vnode) {
    if (typeof vnode.type === 'string' && vnode.props) {
      vnode.props.class = 'hijacked';
      vnode.props.style = 'outline: 4px dotted #00aa00';
    }
  };

  // Listeners and timers of the host's own, so the leak test has noise to filter out.
  var ticks = 0;
  setInterval(function () { ticks += 1; }, 500);
  document.addEventListener('keydown', function () {});
  window.addEventListener('scroll', function () {});

  window.__hostile = { loadAt: null, injectedAt: [] };

  function inject(attrs, onload) {
    var script = document.createElement('script');
    script.src = '/embed.js';
    script.async = true;
    Object.keys(attrs).forEach(function (key) { script.setAttribute('data-' + key, attrs[key]); });
    if (onload) script.onload = onload;
    document.body.appendChild(script);
    window.__hostile.injectedAt.push(performance.now());
  }

  var config = {
    title: 'Get the monthly changelog',
    message: 'One short email when something ships. This is a demo, so nothing is sent.',
    button: 'Subscribe',
    success: "Thanks, you're on the list.",
    accent: '#2563eb',
    position: 'bottom-right',
  };

  document.addEventListener('DOMContentLoaded', function () {
    preact.render(
      preact.h('p', null, "Host app rendered by the page's own Preact 10, options.vnode hook active"),
      document.getElementById('host-app')
    );
  });

  window.addEventListener('load', function () {
    window.__hostile.loadAt = performance.now();
    setTimeout(function () {
      inject(config, function () {
        // A second copy with a different title, e.g. a tag manager adding it again.
        var second = Object.assign({}, config, { title: 'Second copy: this title must not appear' });
        inject(second);
      });
    }, 600);
  });
})();
