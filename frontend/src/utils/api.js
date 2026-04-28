const API = '';

export async function checkHealth() {
  try {
    const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { status: 'error', message: `Server returned ${res.status}` };
    return await res.json();
  } catch {
    return { status: 'error', message: 'Backend is not running' };
  }
}

export async function detectTrash(file, settings = {}) {
  if (!file) throw new Error('No file selected');

  // Client-side validation
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    throw new Error(`Unsupported format "${file.type}". Use JPEG, PNG, or WebP.`);
  }

  const form = new FormData();
  form.append('file', file);
  form.append('grid_rows', settings.gridRows || 4);
  form.append('grid_cols', settings.gridCols || 4);
  form.append('dehaze', settings.dehaze !== false);
  if (settings.outlierSigma != null) form.append('outlier_sigma', settings.outlierSigma);
  if (settings.checksToFlag != null) form.append('checks_to_flag', settings.checksToFlag);

  let res;
  try {
    res = await fetch(`${API}/api/detect`, { method: 'POST', body: form });
  } catch {
    throw new Error('Cannot reach backend. Make sure the server is running on port 8899.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return res.json();
}

export async function exportResults(file, settings = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('grid_rows', settings.gridRows || 4);
  form.append('grid_cols', settings.gridCols || 4);
  form.append('dehaze', settings.dehaze !== false);
  if (settings.outlierSigma != null) form.append('outlier_sigma', settings.outlierSigma);
  if (settings.checksToFlag != null) form.append('checks_to_flag', settings.checksToFlag);

  const res = await fetch(`${API}/api/export`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  a.href = url;
  a.download = match ? match[1] : 'aquascan_results.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchSamples() {
  const res = await fetch(`${API}/api/samples`);
  return res.json();
}

export async function fetchSampleImage(name) {
  const res = await fetch(`${API}/api/sample/${encodeURIComponent(name)}`);
  return res.json();
}
