/** Trigger a browser download of a Blob via a throwaway object URL + anchor click. */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay so Safari/Firefox have started reading the blob before it's freed.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
