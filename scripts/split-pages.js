// One-off: splits the single-page index.html into separate pages (one per tab), each with the
// shared <head>, a <div id="app-header"> (filled by js/nav.js), that tab's <section>, and the
// shared script set. Run once: node scripts/split-pages.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Inner <head> (everything between <head> and </head>)
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>')).replace(/^\n/, '').replace(/\n\s*$/, '');

function section(id) {
    const start = html.indexOf('<section id="' + id + '"');
    if (start === -1) throw new Error('section not found: ' + id);
    const end = html.indexOf('</section>', start) + '</section>'.length;
    let s = html.slice(start, end);
    // standalone pages show their one section, so force it visible
    s = s.replace(/class="tab-content(?: active)?"/, 'class="tab-content active"');
    return s;
}

const SCRIPTS = [
    'js/config.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'js/data-reconstruct.js',
    'js/data-layer.js',
    'js/state.js',
    'js/data.js',
    'js/packaging.js',
    'js/nav.js',
    'js/app.js'
];
function scriptTags(extra) {
    return SCRIPTS.concat(extra || []).map(function (s) { return '    <script src="' + s + '"></script>'; }).join('\n');
}

function page(dataPage, sectionId, extraScripts) {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' + head + '\n</head>\n' +
        '<body class="antialiased" data-page="' + dataPage + '">\n' +
        '    <div id="app-header"></div>\n' +
        '    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">\n' +
        section(sectionId) + '\n' +
        '    </div>\n\n' +
        scriptTags(extraScripts) + '\n' +
        '</body>\n</html>\n';
}

const pages = {
    'index.html': page('dashboard', 'dashboard'),
    'recipes.html': page('recipes', 'recipes'),
    'planner.html': page('prep', 'prep'),
    'calendar.html': page('calendar', 'calendar'),
    'builder.html': page('builder', 'builder', ['js/builder.js'])
};

Object.keys(pages).forEach(function (f) {
    fs.writeFileSync(path.join(root, f), pages[f]);
    console.log('wrote ' + f + '  (' + pages[f].length + ' bytes)');
});
