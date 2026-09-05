# Sidebar recording

Real Hunk 0.21.1 with hunk-history 0.0.4, reviewing this project's public commit
`d3ac317`. No synthetic diff or simulated UI. The recording opens directly in Hunk,
shows tab hover and native file selection, then double-clicks `c1d9a9b` to arm a
range and selects `c471043` as its earlier endpoint. The applied three-commit range
is held on screen so the highlight and net diff are readable.

- Recorder: [EVP pointer-v0.19.0-1](https://github.com/victor-software-house/evp/releases/tag/pointer-v0.19.0-1), the prebuilt Apple Silicon binary.
- Theme: `gruvbox-dark-hard`; terminal background `#1d2021`.
- Geometry: 110 columns × 30 rows, 18px font, 18px padding, 50 fps.
- Source: [sidebar.tape](sidebar.tape).
- Outputs: [animation](sidebar.gif), [Files](files.png), [History](history.png),
  [armed endpoint](range-start.png), [applied range](range.png).

## Reproduce

Install Hunk 0.21.1 and the exact recorder release above. From this repository's
checkout, prepare an isolated clone and Hunk configuration. Do not record a live
user review or copy personal configuration into the capture.

```sh
source_root=$(git rev-parse --show-toplevel)
work=$(mktemp -d)
git clone --branch v0.0.4 --single-branch https://github.com/victor-software-house/hunk-history "$work/hunk-history"
mkdir -p "$work/config/hunk/extensions/hunk-history"
git -C "$work/hunk-history" archive v0.0.4 | tar -x -C "$work/config/hunk/extensions/hunk-history"
printf 'theme = "gruvbox-dark-hard"\n' > "$work/config/hunk/config.toml"
cd "$work/hunk-history"
XDG_CONFIG_HOME="$work/config" mise x github:victor-software-house/evp@pointer-v0.19.0-1 -- evp "$source_root/docs/demo/sidebar.tape"
```

The GIF and PNGs are written into `$work`, outside the reviewed checkout, so they
do not change its working-tree counts. The tape waits for all 37 commits in the
pinned release's history before acting. It runs a separate real terminal session;
existing Hunk windows are untouched.

Inspect both stills and play the GIF in a browser before replacing the assets in
this directory. Confirm the Files click changes the selected file and displayed
diff—not just the pointer position. Verify `End · Esc` after the double-click,
then `Applied 33–35/37` and the `c471043…c1d9a9b` comparison after the endpoint
click. Retain the exact tape alongside the output.
