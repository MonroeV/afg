// Files the game fetches for itself (the sounds), asked for with their version on the end, so
// an updated one is fetched straight away and an unchanged one comes from the browser's copy.
// The server lists each file's version in the page (#bz-files): see versionedPage in server.js.
let files = null;

export function asset(path) {
  if (!files) {
    try {
      files = JSON.parse(document.getElementById('bz-files')?.textContent || '{}');
    } catch {
      files = {};
    }
  }
  const v = files[path];
  return v ? `${path}?v=${v}` : path;
}
