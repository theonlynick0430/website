# niksridhar.com

Personal website. Plain static HTML/CSS/JS, hosted on GitHub Pages (`CNAME` → www.niksridhar.com).

```
index.html            all page content
css/site.css          styles (mobile breakpoint at 640px)
js/landscape.js       optimization-landscape scrollbar (desktop ≥1100px only); tunables in CONFIG at top
js/trail.js           draws the dotted trail between releases
assets/               photo, publication media, favicon
releases/<slug>/      files for each "You can just learn things" release
```

Preview locally: `python3 -m http.server` then open http://localhost:8000.

## Adding a release
1. Put the files in `releases/<slug>/`.
2. In `index.html`, copy an `<li class="stop">` block in the `.trail` list and edit it.
   - `stop__kind` is a free-form label (Notes, Video, Reading list, ...).
   - Links go in `.stop__files`; embeds (video, YouTube iframe, image) go in a `<div class="stop__media">`.
   - Unreleased entries get `class="stop stop--upcoming"` (grayed out).

GitHub rejects files over 100 MB, so keep each release file under that.
